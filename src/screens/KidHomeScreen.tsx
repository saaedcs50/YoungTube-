import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import db, { FeedItem, Channel } from '../db';
import channelsSeed from '../../channels_seed.json';
import { useAllCategories } from '../hooks/useAllCategories';
import { matchCategory } from '../categories';
import { ensureChannelsArchiveSynced, scheduleBackgroundPortraitCheck, migrateUnhidePortraitVideos } from '../filtering';
import { loadCachedBlocks, fetchGlobalBlocks } from '../services/globalBlocks';
import { WeeklyChoiceCard } from '../components/WeeklyChoiceCard';
import { TasteReactionBar } from '../components/TasteReactionBar';
import { VideoCard } from '../components/VideoCard';
import { WindowVirtualizer } from 'virtua';
import { enrichFeedItemViewCounts } from '../services/youtubeViewCounts';
import {
  computeBaseShare,
  resolveEffectiveShare,
  isCategoryInCooldown,
  getOrInitCategoryState,
  bridgeInterleave,
} from '../tasteShiftEngine';
import { logImpressedBatch } from '../tasteShiftStorage';
import type { TasteShiftConfig } from '../tasteShiftTypes';
import {
  Play,
  Lock,
  Sparkles,
  Film,
  Compass,
  RefreshCw,
  VolumeX,
  Smile,
  Search,
  X,
  Heart,
  ArrowRight,
  Star,
} from 'lucide-react';

interface KidHomeScreenProps {
  onOpenParentDashboard: () => void;
  onOpenDemoPlayer?: () => void;
  onSelectVideo?: (
    videoId: string,
    title?: string,
    channelName?: string,
    channelId?: string
  ) => void;
  refreshTrigger?: number;
  suppressedVideoIds?: string[];
}

// Built-in starter videos mapped to actual curated channels from channels_seed.json
// Guarantees immediate, visually vibrant content even on fresh install or offline
const STARTER_VIDEOS: FeedItem[] = [
  {
    videoId: 's6X_Q54_PBs',
    channelId: 'UC_qs3c0ehDvZkbiEbOj6Drg', // Alphablocks
    title: 'Alphablocks - مغامرة الحروف الإنجليزية والكلمات السحرية للأطفال',
    hasMusic: true,
    fetchedAt: Date.now(),
    hidden: false,
  },
  {
    videoId: 'u7e33WnUf0A',
    channelId: 'UCPlwvN0w4qFSP1FllALB92w', // Numberblocks
    title: 'Numberblocks - أصدقاء الأرقام الممتعة وتعلم الحساب بطريقة مبسطة',
    hasMusic: true,
    fetchedAt: Date.now(),
    hidden: false,
  },
  {
    videoId: 'x1rB6E1oTss',
    channelId: 'UC5XMF3Inoi8R9nSI8ChOsdQ', // Art for Kids Hub
    title: 'Art for Kids Hub - تعلم رسم وتلوين الحيوانات خطوة بخطوة بالريشة',
    hasMusic: false,
    fetchedAt: Date.now(),
    hidden: false,
  },
  {
    videoId: 'w_gWvL8fN8g',
    channelId: 'UCazFScO30FKY3YoNNDfNY5g', // Arabian Fairy Tales
    title: 'Arabian Fairy Tales - حكاية الشجرة الحكيمة والطيور الملونة',
    hasMusic: false,
    fetchedAt: Date.now(),
    hidden: false,
  },
  {
    videoId: '02E1468SdHg',
    channelId: 'UC5uIZ2KOZZeQDQo_Gsi_qbQ', // Cosmic Kids Yoga
    title: 'Cosmic Kids Yoga - مغامرة الحركة واليوغا والنشاط الصحي للصغار',
    hasMusic: true,
    fetchedAt: Date.now(),
    hidden: false,
  },
  {
    videoId: 'UeF09e7hDbg',
    channelId: 'UC57XAjJ04TY8gNxOWf-Sy0Q', // 5-Minute Crafts PLAY
    title: '5-Minute Crafts PLAY - أفكار أشغال يدوية وابتكارات بالكرتون والورق',
    hasMusic: false,
    fetchedAt: Date.now(),
    hidden: false,
  },
  {
    videoId: 'tbCjkPlsaes',
    channelId: 'UC0Ik25PHaiHCbfGrzu-lBFQ', // AllAttack / sports
    title: 'AllAttack - مهارات وتحديات رياضية ممتعة وتشجيعية للأبطال الصغار',
    hasMusic: true,
    fetchedAt: Date.now(),
    hidden: false,
  },
];

let sessionShuffleCounter = 0;

function getRandom(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / (0xffffffff + 1);
  }
  return Math.random();
}

// High-entropy Fisher-Yates shuffle to randomize video order across full candidate pool
function shuffleVideos(array: FeedItem[]): FeedItem[] {
  sessionShuffleCounter += 1;
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const r = getRandom();
    const j = Math.floor(r * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Lightweight diversity constraint: avoids placing 3+ videos from the same channelId
 * consecutively when the pool allows (max-2 streak per channel).
 */
function enforceChannelDiversity(items: FeedItem[], maxConsecutive = 2): FeedItem[] {
  if (items.length <= maxConsecutive) return items;
  const arr = [...items];
  let currentChannel = arr[0]?.channelId;
  let streak = 1;

  for (let i = 1; i < arr.length; i++) {
    const ch = arr[i]?.channelId;
    if (ch && currentChannel && ch === currentChannel) {
      streak += 1;
      if (streak > maxConsecutive) {
        // Look ahead for the next video from a different channel to break the streak
        let swapIdx = -1;
        for (let j = i + 1; j < arr.length; j++) {
          if (arr[j]?.channelId && arr[j].channelId !== currentChannel) {
            swapIdx = j;
            break;
          }
        }
        if (swapIdx !== -1) {
          [arr[i], arr[swapIdx]] = [arr[swapIdx], arr[i]];
          currentChannel = arr[i].channelId;
          streak = 1;
        }
      }
    } else {
      currentChannel = ch;
      streak = 1;
    }
  }
  return arr;
}

/**
 * In-place merge for silent background sync:
 * Preserves the exact user scroll order while updating item metadata (views, flags)
 * and safely appending newly discovered videos at the end without jump.
 */
function mergeInPlace(prev: FeedItem[], latest: FeedItem[]): FeedItem[] {
  if (prev.length === 0) return enforceChannelDiversity(shuffleVideos(latest));
  const latestMap = new Map(latest.map((v) => [v.videoId, v]));
  const kept = prev
    .filter((v) => latestMap.has(v.videoId))
    .map((v) => {
      const updated = latestMap.get(v.videoId)!;
      return { ...v, ...updated };
    });
  const keptIds = new Set(kept.map((v) => v.videoId));
  const added = latest.filter((v) => !keptIds.has(v.videoId));
  return added.length > 0 ? [...kept, ...enforceChannelDiversity(shuffleVideos(added))] : kept;
}

function videoRecency(item: FeedItem): number {
  if (item.publishedAt) {
    const parsed = Date.parse(String(item.publishedAt));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return item.fetchedAt || 0;
}

const PER_CHANNEL_CAP = 15;
const QUERY_CHUNK = 20;
const CACHE_TRIM_ABOVE = 40;
const CACHE_KEEP = 30;

/** Bounded, recency-sorted load of enabled-channel videos (chunked anyOf, not 196 parallel queries). */
async function loadBoundedFeed(
  enabledChannelIds: string[],
  hideMusicVideos: boolean
): Promise<FeedItem[]> {
  const cachedBlocks = loadCachedBlocks();
  const blockedChannelSet = new Set(cachedBlocks.channelIds);

  const result: FeedItem[] = [];
  const extrasToTrim: string[] = [];
  for (let i = 0; i < enabledChannelIds.length; i += QUERY_CHUNK) {
    const chunk = enabledChannelIds.slice(i, i + QUERY_CHUNK);
    const rows = await db.feedCache.where('channelId').anyOf(chunk).toArray();
    const byChannel = new Map<string, FeedItem[]>();
    for (const row of rows) {
      if (row.hidden === true) continue;
      if (hideMusicVideos && row.hasMusic === true) continue;
      if (blockedChannelSet.has(row.channelId)) continue;
      const list = byChannel.get(row.channelId);
      if (list) list.push(row);
      else byChannel.set(row.channelId, [row]);
    }
    for (const list of byChannel.values()) {
      list.sort((a, b) => videoRecency(b) - videoRecency(a));
      result.push(...list.slice(0, PER_CHANNEL_CAP));
      // Trim bloated cache leftover from older builds (200 videos/channel)
      if (list.length > CACHE_TRIM_ABOVE) {
        for (const extra of list.slice(CACHE_KEEP)) {
          extrasToTrim.push(extra.videoId);
        }
      }
    }
  }
  if (extrasToTrim.length > 0) {
    void db.feedCache.bulkDelete(extrasToTrim);
  }
  return result;
}

function useColumnCount(): number {
  const [cols, setCols] = useState(() => {
    if (typeof window === 'undefined') return 1;
    const width = window.innerWidth;
    if (width >= 1024) return 4;
    if (width >= 768) return 3;
    if (width >= 640) return 2;
    return 1;
  });

  useEffect(() => {
    const onResize = () => {
      const width = window.innerWidth;
      let newCols = 1;
      if (width >= 1024) newCols = 4;
      else if (width >= 768) newCols = 3;
      else if (width >= 640) newCols = 2;
      else newCols = 1;
      setCols(newCols);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return cols;
}

export default function KidHomeScreen({
  onOpenParentDashboard,
  onOpenDemoPlayer,
  onSelectVideo,
  refreshTrigger = 0,
  suppressedVideoIds = [],
}: KidHomeScreenProps) {
  const columnCount = useColumnCount();
  const { kidCategories } = useAllCategories();
  const [videos, setVideos] = useState<FeedItem[]>([]);
  const [dbChannelsList, setDbChannelsList] = useState<Channel[]>([]);
  const [childName, setChildName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Child-facing Favorites view state
  const [showFavorites, setShowFavorites] = useState(false);
  const [favoritesVideos, setFavoritesVideos] = useState<FeedItem[]>([]);
  const [favoritesCount, setFavoritesCount] = useState(0);

  // Taste Shift feature state
  const [tasteShiftConfig, setTasteShiftConfig] = useState<{
    enabled: boolean;
    targetCategories: string[];
    activeCategoryThisWeek?: string;
    choiceWeekNumber?: number;
    currentWeek: number;
  } | null>(null);

  const tasteTargetSet = useMemo(() => {
    if (
      !tasteShiftConfig?.enabled ||
      !tasteShiftConfig.activeCategoryThisWeek
    ) {
      return null;
    }
    return new Set([tasteShiftConfig.activeCategoryThisWeek]);
  }, [tasteShiftConfig]);

  // Child-choice card visibility: enabled and child hasn't chosen for currentWeek
  const showWeeklyChoiceCard = Boolean(
    tasteShiftConfig?.enabled &&
      tasteShiftConfig.targetCategories?.length > 0 &&
      tasteShiftConfig.currentWeek !== tasteShiftConfig.choiceWeekNumber
  );

  // 200ms debounce on search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim().toLowerCase());
    }, 200);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 1. Build channel metadata lookup map combining channels_seed.json and custom db.channels
  const channelMap = useMemo(() => {
    const map = new Map<
      string,
      { title: string; categories: string[]; thumbnail?: string; enabled?: boolean }
    >();
    for (const ch of channelsSeed as any[]) {
      if (ch.sourceId) {
        const cats: string[] = ch.categories || ch.category || [];
        map.set(ch.sourceId, {
          title: ch.title || ch.originalName || 'قناة أطفال موثوقة',
          categories: Array.isArray(cats) ? cats : [cats],
          thumbnail: ch.thumbnail,
          enabled: true,
        });
      }
    }
    for (const ch of dbChannelsList) {
      if (ch.sourceId) {
        const existing = map.get(ch.sourceId);
        map.set(ch.sourceId, {
          title: ch.title || existing?.title || 'قناة أطفال موثوقة',
          categories:
            Array.isArray(ch.category) && ch.category.length > 0
              ? ch.category
              : existing?.categories || [],
          thumbnail: ch.thumbnail || existing?.thumbnail,
          enabled: ch.enabled,
        });
      }
    }
    return map;
  }, [dbChannelsList]);

  // 2. Load safe videos using indexed, bounded query on enabled channels
  const loadVideos = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      await migrateUnhidePortraitVideos().catch(() => {});

      const [storedChannels, settings] = await Promise.all([
        db.channels.toArray(),
        db.settings.get('main'),
      ]);

      if (settings?.childName) {
        setChildName(settings.childName);
      } else {
        setChildName('');
      }

      setDbChannelsList(storedChannels);

      const cachedBlocks = loadCachedBlocks();
      const blockedChannelSet = new Set(cachedBlocks.channelIds);

      // Map of disabled vs enabled channel IDs
      const disabledChannelIds = new Set(
        storedChannels.filter((c) => c.enabled === false).map((c) => c.sourceId)
      );

      const enabledChannelIds = Array.from(
        new Set([
          ...storedChannels.filter((c) => c.enabled !== false).map((c) => c.sourceId),
          ...(channelsSeed as any[]).map((c) => c.sourceId),
        ])
      ).filter((id) => !disabledChannelIds.has(id) && !blockedChannelSet.has(id));

      const hideMusicVideos = settings?.hideMusicVideos === true;

      let availableVideos: FeedItem[] = [];
      if (enabledChannelIds.length > 0) {
        availableVideos = await loadBoundedFeed(enabledChannelIds, hideMusicVideos);
      }

      // If feedCache is empty, seed initial curated safe videos
      if (availableVideos.length === 0) {
        const totalCacheCount = await db.feedCache.count();
        if (totalCacheCount === 0) {
          const safeStarters = STARTER_VIDEOS.filter((v) => !blockedChannelSet.has(v.channelId));
          await db.feedCache.bulkPut(safeStarters);
          availableVideos = hideMusicVideos
            ? safeStarters.filter((v) => v.hasMusic !== true)
            : safeStarters;
        }
      }

      // Taste Shift Feed Composition Logic (Phase B: effectiveShare + cooldown)
      const tasteShift = settings?.tasteShift as TasteShiftConfig | undefined;
      if (!tasteShift?.enabled || !tasteShift.targetCategories || tasteShift.targetCategories.length === 0) {
        setTasteShiftConfig(null);
        if (silent) {
          setVideos((prev) => mergeInPlace(prev, availableVideos));
        } else {
          setVideos(enforceChannelDiversity(shuffleVideos(availableVideos)));
        }
      } else {
        const { currentWeek, baseShare } = computeBaseShare(
          tasteShift.startDate,
          tasteShift.weeklyStepPercent ?? 10,
          tasteShift.capPercent ?? 40
        );

        const hasChosenThisWeek =
          tasteShift.choiceWeekNumber === currentWeek &&
          Boolean(tasteShift.activeCategoryThisWeek);

        const activeCategory = hasChosenThisWeek
          ? tasteShift.activeCategoryThisWeek
          : undefined;

        setTasteShiftConfig({
          enabled: true,
          targetCategories: tasteShift.targetCategories,
          activeCategoryThisWeek: activeCategory,
          choiceWeekNumber: tasteShift.choiceWeekNumber,
          currentWeek,
        });

        if (!activeCategory) {
          if (silent) {
            setVideos((prev) => mergeInPlace(prev, availableVideos));
          } else {
            setVideos(enforceChannelDiversity(shuffleVideos(availableVideos)));
          }
        } else {
          const catState = getOrInitCategoryState(tasteShift, activeCategory, baseShare);
          if (isCategoryInCooldown(catState)) {
            // Hard reject cooldown: serve normal feed without target mix
            if (silent) {
              setVideos((prev) => mergeInPlace(prev, availableVideos));
            } else {
              setVideos(enforceChannelDiversity(shuffleVideos(availableVideos)));
            }
          } else {
            const share = resolveEffectiveShare(tasteShift, activeCategory);

            const channelCatLookup = new Map<string, string[]>();
            for (const ch of channelsSeed as any[]) {
              if (ch.sourceId) {
                const cats: string[] = ch.categories || ch.category || [];
                channelCatLookup.set(ch.sourceId, Array.isArray(cats) ? cats : [cats]);
              }
            }
            for (const ch of storedChannels) {
              if (ch.sourceId) {
                const cats = ch.category;
                if (Array.isArray(cats) && cats.length > 0) {
                  channelCatLookup.set(ch.sourceId, cats);
                }
              }
            }

            const targetSet = new Set([activeCategory]);
            const targetPool: FeedItem[] = [];
            const restPool: FeedItem[] = [];

            for (const video of availableVideos) {
              const directCats = (video as any).categories || (video as any).category;
              const cats: string[] = directCats
                ? Array.isArray(directCats)
                  ? directCats
                  : [directCats]
                : channelCatLookup.get(video.channelId) || [];
              if (cats.some((cat) => targetSet.has(cat))) targetPool.push(video);
              else restPool.push(video);
            }

            const targetCount = Math.round((availableVideos.length * share) / 100);
            const shuffledTarget = enforceChannelDiversity(shuffleVideos(targetPool));
            const shuffledRest = enforceChannelDiversity(shuffleVideos(restPool));
            const takeTargetCount = Math.min(targetCount, shuffledTarget.length);
            const takeRestCount = availableVideos.length - takeTargetCount;
            const chosenTarget = shuffledTarget.slice(0, takeTargetCount);
            const chosenRest = shuffledRest.slice(0, Math.max(0, takeRestCount));
            // Phase C: 2 familiar + 1 new with randomized phase (no rigid predictable pattern)
            const combined = enforceChannelDiversity(bridgeInterleave(chosenRest, chosenTarget, 2));

            if (silent) {
              setVideos((prev) => mergeInPlace(prev, combined));
            } else {
              setVideos(combined);
            }

            // Log impressions for first batch of target cards (async, non-blocking)
            if (chosenTarget.length > 0) {
              void logImpressedBatch(
                activeCategory,
                chosenTarget.slice(0, 8).map((v) => v.videoId)
              );
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to query db in KidHomeScreen:', err);
      setVideos((prev) => (prev.length > 0 ? prev : enforceChannelDiversity(shuffleVideos(STARTER_VIDEOS))));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos, refreshTrigger]);

  // Once per app session when entering kids view or on first mount after DB ready:
  // Refresh global blocks and trigger a light feed refresh if the blocked set changed
  const hasRefreshedBlocksRef = useRef(false);
  useEffect(() => {
    if (hasRefreshedBlocksRef.current) return;
    hasRefreshedBlocksRef.current = true;

    const initialCached = loadCachedBlocks();
    const initialKey = [...initialCached.channelIds, ...initialCached.playlistIds].sort().join(',');

    void (async () => {
      try {
        const fresh = await fetchGlobalBlocks();
        const freshKey = [...fresh.channelIds, ...fresh.playlistIds].sort().join(',');
        if (freshKey !== initialKey) {
          void loadVideos(true);
        }
      } catch {
        // Fail-open: network error must not block feed load
      }
    })();
  }, [loadVideos]);

  // Silent background sync — retries if KV is empty or the first attempt fails
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const delays = [50, 15_000, 45_000, 90_000];
    let attempt = 0;

    const run = async () => {
      const ok = await ensureChannelsArchiveSynced();
      if (cancelled) return;
      if (ok) {
        await loadVideos(true);
        return;
      }
      attempt += 1;
      if (attempt < delays.length) {
        timer = window.setTimeout(() => {
          void run();
        }, delays[attempt]);
      }
    };

    timer = window.setTimeout(() => {
      void run();
    }, delays[0]);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [loadVideos]);

  // Stable callback to incrementally merge enriched view counts into active feed state
  const handleViewCountsUpdated = useCallback((updatedMap: Record<string, number>) => {
    setVideos((prevVideos) =>
      prevVideos.map((v) =>
        updatedMap[v.videoId] !== undefined && v.viewCount !== updatedMap[v.videoId]
          ? { ...v, viewCount: updatedMap[v.videoId], viewCountFetchedAt: Date.now() }
          : v
      )
    );
  }, []);

  // Stable signature of video IDs in the feed to avoid redundant enrichment runs on pure array re-renders
  const feedVideoIdsSignature = useMemo(
    () =>
      videos
        .map((v) => v.videoId)
        .filter(Boolean)
        .sort()
        .join(','),
    [videos]
  );

  // Background view counts enrichment (non-blocking, runs on idle after first paint)
  useEffect(() => {
    if (loading || !feedVideoIdsSignature) return;

    let cancelled = false;
    const runEnrichment = () => {
      if (cancelled) return;
      void enrichFeedItemViewCounts(videos, (updatedMap) => {
        if (!cancelled) {
          handleViewCountsUpdated(updatedMap);
        }
      });
    };

    let idleId: number | undefined;
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = (window as any).requestIdleCallback(runEnrichment, { timeout: 3000 });
    } else {
      idleId = setTimeout(runEnrichment, 800) as unknown as number;
    }

    return () => {
      cancelled = true;
      if (idleId !== undefined) {
        if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
          (window as any).cancelIdleCallback(idleId);
        } else {
          clearTimeout(idleId);
        }
      }
    };
  }, [feedVideoIdsSignature, loading, handleViewCountsUpdated]);

  const hasScheduledPortraitCheckRef = useRef(false);

  // Non-blocking background portrait video check (idle after first paint, at most once per mount)
  useEffect(() => {
    if (!hasScheduledPortraitCheckRef.current) {
      hasScheduledPortraitCheckRef.current = true;
      scheduleBackgroundPortraitCheck();
    }
  }, []);

  const suppressedSet = useMemo(() => new Set(suppressedVideoIds), [suppressedVideoIds]);

  // 2.5 Load favorites videos (liked videos) with strict safety filters
  const loadFavorites = useCallback(async () => {
    try {
      const [interactions, storedChannels, settings] = await Promise.all([
        db.interactions
          .filter(
            (i) => i.childLoved === true || i.childReaction === 'liked' || i.parentRating === 'liked'
          )
          .toArray(),
        db.channels.toArray(),
        db.settings.get('main'),
      ]);

      // One-time migration for legacy parentRating === 'liked' rows -> set childLoved: true, remove parentRating
      for (const inter of interactions) {
        if (inter.parentRating === 'liked' && !inter.childLoved) {
          inter.childLoved = true;
          inter.parentRating = undefined;
          void db.interactions.update(inter.videoId, {
            childLoved: true,
            parentRating: undefined,
          });
        }
      }

      interactions.sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0));

      const disabledChannelIds = new Set(
        storedChannels.filter((c) => c.enabled === false).map((c) => c.sourceId)
      );

      const cachedBlocks = loadCachedBlocks();
      const blockedChannelSet = new Set(cachedBlocks.channelIds);

      const hideMusicVideos = settings?.hideMusicVideos === true;
      const suppressed = new Set(suppressedVideoIds);

      const videoIds = interactions.map((i) => i.videoId);
      const cachedRows =
        videoIds.length > 0 ? await db.feedCache.where('videoId').anyOf(videoIds).toArray() : [];
      const cachedMap = new Map(cachedRows.map((r) => [r.videoId, r]));

      const safeList: FeedItem[] = [];
      for (const inter of interactions) {
        if (suppressed.has(inter.videoId)) continue;

        const cached = cachedMap.get(inter.videoId);
        if (cached?.hidden === true) continue;

        const targetChannelId = inter.channelId || cached?.channelId;
        if (targetChannelId && (disabledChannelIds.has(targetChannelId) || blockedChannelSet.has(targetChannelId))) continue;

        if (hideMusicVideos && cached?.hasMusic === true) continue;

        safeList.push({
          videoId: inter.videoId,
          channelId: targetChannelId || 'unknown',
          title: inter.title || cached?.title || 'فيديو أطفال',
          hasMusic: cached?.hasMusic,
          fetchedAt: inter.lastWatched || Date.now(),
          hidden: false,
          viewCount: cached?.viewCount,
          viewCountFetchedAt: cached?.viewCountFetchedAt,
        });
      }

      setFavoritesVideos(safeList);
      setFavoritesCount(safeList.length);
    } catch (err) {
      console.error('Failed to load favorites videos:', err);
    }
  }, [suppressedVideoIds]);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites, refreshTrigger, showFavorites]);

  // 3. Filter videos by selected category and client-side in-feed search
  const filteredVideos = useMemo(() => {
    let result = videos;
    if (suppressedSet.size > 0) {
      result = result.filter((video) => !suppressedSet.has(video.videoId));
    }

    // Filter by category
    if (selectedCategory !== 'all') {
      result = result.filter((video) => {
        const channelInfo = channelMap.get(video.channelId);
        const channelCats = channelInfo?.categories || (video as any).categories || (video as any).category;
        return matchCategory(channelCats, selectedCategory);
      });
    }

    // In-feed search (ONLY searches already-approved, cached videos client-side)
    if (debouncedSearch) {
      result = result.filter((video) => {
        const channelInfo = channelMap.get(video.channelId);
        const titleMatch = video.title.toLowerCase().includes(debouncedSearch);
        const channelMatch = channelInfo?.title.toLowerCase().includes(debouncedSearch);
        return titleMatch || channelMatch;
      });
    }

    return result;
  }, [videos, selectedCategory, debouncedSearch, channelMap, suppressedSet]);

  // 3.5 Filter favorites by search query
  const filteredFavorites = useMemo(() => {
    if (!debouncedSearch) return favoritesVideos;
    return favoritesVideos.filter((video) => {
      const channelInfo = channelMap.get(video.channelId);
      const titleMatch = video.title.toLowerCase().includes(debouncedSearch);
      const channelMatch = channelInfo?.title.toLowerCase().includes(debouncedSearch);
      return titleMatch || channelMatch;
    });
  }, [favoritesVideos, debouncedSearch, channelMap]);

  // Chunk filtered videos into rows for virtualization
  const videoRows = useMemo(() => {
    const rows: FeedItem[][] = [];
    for (let i = 0; i < filteredVideos.length; i += columnCount) {
      rows.push(filteredVideos.slice(i, i + columnCount));
    }
    return rows;
  }, [filteredVideos, columnCount]);

  return (
    <div
      id="kid-home-screen"
      className="min-h-screen bg-[#FAF8F5] text-stone-900 flex flex-col select-none font-sans"
    >
      {/* 1. Sticky Header Bar: bg-[#FAF8F5]/90, backdrop-blur, border-b border-amber-100 */}
      <header className="sticky top-0 z-40 bg-[#FAF8F5]/90 backdrop-blur-md border-b border-amber-100 px-4 sm:px-8 py-3.5 shadow-sm">
        <div className="max-w-7xl mx-auto space-y-3">
          <div className="flex items-center justify-between">
            {/* Right side in RTL: 44x44 badge with star icon + small line "مرحباً يا بطل" and extra-bold child name */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-400 text-white flex items-center justify-center shadow-sm shrink-0">
                <Star className="w-6 h-6 fill-white" />
              </div>
              <div className="flex flex-col text-right">
                <span className="text-xs font-medium text-stone-500">مرحباً يا بطل</span>
                <span className="text-xl font-extrabold text-stone-900 tracking-tight leading-tight">
                  {childName || 'عالم ياسين'}
                </span>
              </div>
            </div>

            {/* Left side in RTL: Two 44x44 round white buttons (Heart favorites, Lock parents) */}
            <div className="flex items-center gap-2.5">
              <button
                id="kid-favorites-toggle-btn"
                type="button"
                onClick={() => {
                  setShowFavorites((prev) => !prev);
                }}
                className={`w-11 h-11 rounded-full bg-white border border-stone-100 shadow-sm flex items-center justify-center transition active:scale-[0.98] cursor-pointer ${
                  showFavorites
                    ? 'text-rose-500 ring-2 ring-rose-300'
                    : 'text-stone-700 hover:text-rose-500 hover:bg-stone-50'
                }`}
                title="المفضلة"
                aria-label="المفضلة"
              >
                <Heart
                  className={`w-5 h-5 ${
                    showFavorites ? 'fill-rose-500 text-rose-500' : 'text-stone-700'
                  }`}
                />
              </button>

              <button
                id="parent-dashboard-lock-btn"
                type="button"
                onClick={onOpenParentDashboard}
                className="w-11 h-11 rounded-full bg-white border border-stone-100 shadow-sm flex items-center justify-center text-stone-700 hover:text-stone-900 hover:bg-stone-50 transition active:scale-[0.98] cursor-pointer"
                title="منطقة الوالدين"
                aria-label="منطقة الوالدين"
              >
                <Lock className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Under that: full-width search pill, white, rounded-2xl, amber search icon, keep current search logic */}
          <div className="relative w-full">
            <div className="relative flex items-center">
              <input
                id="kid-feed-search-input"
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="ابحث في الفيديوهات المسموحة..."
                className="w-full pl-10 pr-11 py-2.5 rounded-2xl bg-white border border-stone-100 text-xs sm:text-sm text-stone-900 placeholder-stone-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 shadow-sm transition-all"
              />
              <div className="absolute right-3.5 text-amber-500 pointer-events-none flex items-center justify-center">
                <Search className="w-4 h-4" />
              </div>
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setDebouncedSearch('');
                  }}
                  className="absolute left-3 text-stone-400 hover:text-stone-700 p-1 rounded-full hover:bg-stone-100 transition cursor-pointer"
                  title="مسح البحث"
                  aria-label="مسح البحث"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 2. Category Filter Chips (Horizontal scroll, hide scrollbar) */}
      <section className="px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-none">
            {kidCategories.map((cat) => {
              const isActive = !showFavorites && selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  id={`cat-chip-${cat.id}`}
                  type="button"
                  onClick={() => {
                    setShowFavorites(false);
                    setSelectedCategory(cat.id);
                    void loadVideos(false);
                  }}
                  className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm transition duration-150 active:scale-[0.98] cursor-pointer ${
                    isActive
                      ? 'bg-amber-500 text-white font-bold shadow-md shadow-amber-500/25'
                      : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  <span>{cat.emoji}</span>
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. Main Video Grid */}
      <main className="grow w-full py-4 sm:py-6">
        {showFavorites ? (
          <div id="kid-favorites-view" className="space-y-6">
            {/* Header banner with back button */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/95 p-4 sm:p-5 rounded-3xl border border-rose-100 shadow-[0_2px_12px_rgba(244,63,94,0.05)]">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0 border border-rose-100 shadow-sm">
                    <Heart className="w-6 h-6 fill-rose-500" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-stone-900 flex items-center gap-2">
                      <span>فيديوهاتي المفضلة ❤️</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold border border-rose-200">
                        {filteredFavorites.length} فيديو
                      </span>
                    </h2>
                    <p className="text-xs text-stone-500">
                      الفيديوهات التي نالت إعجابك وتستمتع بمشاهدتها دائماً
                    </p>
                  </div>
                </div>

                <button
                  id="back-to-home-feed-btn"
                  type="button"
                  onClick={() => setShowFavorites(false)}
                  className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs sm:text-sm font-bold transition active:scale-95 cursor-pointer shadow-sm"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>العودة للفيديوهات</span>
                </button>
              </div>
            </div>

            {/* Favorites Video Grid or Empty State */}
            {filteredFavorites.length === 0 ? (
              debouncedSearch ? (
                <div className="max-w-lg mx-auto my-6 px-4">
                  <div className="bg-white/90 rounded-3xl border border-rose-100 p-8 text-center space-y-4 shadow-sm">
                    <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto shadow-sm">
                      <Search className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base sm:text-lg font-black text-stone-900">
                        مفيش فيديو مفضل بهذا الاسم
                      </h3>
                      <p className="text-xs text-stone-500 max-w-md mx-auto">
                        تأكد من كتابة الاسم بشكل صحيح أو امسح البحث لمشاهدة كل مفضلاتك.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput('');
                        setDebouncedSearch('');
                      }}
                      className="px-5 py-2.5 rounded-full bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition shadow-sm cursor-pointer active:scale-95"
                    >
                      عرض كل الفيديوهات المفضلة ❤️
                    </button>
                  </div>
                </div>
              ) : (
                /* Empty state, kid-friendly tone specified by user */
                <div
                  id="kid-favorites-empty-state"
                  className="max-w-lg mx-auto my-8 px-4"
                >
                  <div className="bg-white/90 rounded-3xl border border-rose-100 p-8 sm:p-10 text-center space-y-4 shadow-sm flex flex-col items-center">
                    <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto border border-rose-100 shadow-sm">
                      <Heart className="w-8 h-8 fill-rose-500" />
                    </div>
                    <div className="space-y-1.5 max-w-md mx-auto">
                      <h3 className="text-base sm:text-lg font-black text-stone-900">
                        لسه مفيش فيديوهات حبيتها ❤️
                      </h3>
                      <p className="text-xs sm:text-sm text-stone-500 leading-relaxed">
                        اضغط على القلب وانت بتتفرج عشان تحفظها هنا!
                      </p>
                    </div>
                    <button
                      id="back-to-feed-from-empty-favorites-btn"
                      type="button"
                      onClick={() => setShowFavorites(false)}
                      className="px-6 py-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm font-bold transition shadow-sm cursor-pointer active:scale-95 flex items-center gap-1.5"
                    >
                      <ArrowRight className="w-4 h-4" />
                      <span>العودة للفيديوهات</span>
                    </button>
                  </div>
                </div>
              )
            ) : (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
                  {filteredFavorites.map((video) => {
                    const channelInfo = channelMap.get(video.channelId);
                    return (
                      <VideoCard
                        key={video.videoId}
                        video={video}
                        channelTitle={channelInfo?.title || 'قناة أطفال'}
                        isFavorite={true}
                        onSelectVideo={onSelectVideo}
                        onOpenDemoPlayer={onOpenDemoPlayer}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : loading ? (
          /* Shimmer Skeleton matching rounded-[28px], border-stone-100 */
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div
                  key={`skeleton-card-${idx}`}
                  className="bg-white rounded-[28px] overflow-hidden border border-stone-100 shadow-sm flex flex-col animate-pulse"
                >
                  <div className="aspect-video w-full bg-stone-200/70" />
                  <div className="p-4 space-y-2.5 bg-white">
                    <div className="h-4 bg-stone-200/80 rounded-full w-4/5" />
                    <div className="h-4 bg-stone-200/50 rounded-full w-3/5" />
                    <div className="h-3 bg-stone-100 rounded-full w-1/3 pt-1" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : filteredVideos.length === 0 ? (
          debouncedSearch ? (
            /* Part A: Friendly Search Empty State */
            <div className="max-w-lg mx-auto my-8 sm:my-12 px-4">
              <div className="bg-white rounded-[28px] border border-stone-100 p-8 sm:p-10 text-center space-y-4 shadow-sm">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto shadow-sm border border-amber-100">
                  <Search className="w-8 h-8" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base sm:text-lg font-black text-stone-900">
                    مفيش فيديوهات بالاسم ده جوه القنوات المسموحة
                  </h3>
                  <p className="text-xs sm:text-sm text-stone-500 max-w-sm mx-auto leading-relaxed">
                    هذا البحث يعمل فقط داخل مكتبة القنوات الآمنة المصرح بها للطفل ولا يبحث في الإنترنت الخارجي.
                  </p>
                </div>
                <button
                  id="clear-search-empty-btn"
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setDebouncedSearch('');
                  }}
                  className="px-6 py-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm font-bold transition shadow-sm cursor-pointer active:scale-95"
                >
                  مسح البحث وعرض كل الفيديوهات ✨
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-lg mx-auto my-8 sm:my-12 px-4">
              <div className="bg-white rounded-[28px] border border-stone-100 p-8 sm:p-10 text-center space-y-4 shadow-sm">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto shadow-sm border border-amber-100">
                  <Film className="w-8 h-8" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base sm:text-lg font-black text-stone-900">
                    لا توجد فيديوهات في هذا القسم حالياً
                  </h3>
                  <p className="text-xs sm:text-sm text-stone-500 max-w-sm mx-auto leading-relaxed">
                    يمكنك تصفح باقي الأقسام الممتعة أو العودة لقسم &quot;الكل&quot; لمشاهدة جميع الفيديوهات.
                  </p>
                </div>
                <button
                  id="reset-filter-btn"
                  type="button"
                  onClick={() => {
                    setSelectedCategory('all');
                    void loadVideos(false);
                  }}
                  className="px-6 py-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm font-bold transition shadow-sm cursor-pointer active:scale-95"
                >
                  عرض جميع الفيديوهات ✨
                </button>
              </div>
            </div>
          )
        ) : (
          <div>
            {showWeeklyChoiceCard && tasteShiftConfig && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-5 sm:mb-6">
                <WeeklyChoiceCard
                  targetCategories={tasteShiftConfig.targetCategories}
                  currentWeek={tasteShiftConfig.currentWeek}
                  onChoiceMade={() => loadVideos(true)}
                />
              </div>
            )}

            {filteredVideos.length <= 12 ? (
              /* Non-virtualized small list */
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
                  {filteredVideos.map((video) => {
                    const channelInfo = channelMap.get(video.channelId);
                    const channelTitle = channelInfo?.title || 'قناة أطفال';
                    const videoCats =
                      channelInfo?.categories ||
                      (video as any).categories ||
                      (video as any).category ||
                      [];
                    const isTasteShiftTarget = Boolean(
                      tasteTargetSet &&
                        (Array.isArray(videoCats) ? videoCats : [videoCats]).some((cat: string) =>
                          tasteTargetSet.has(cat)
                        )
                    );

                    return (
                      <VideoCard
                        key={video.videoId}
                        video={video}
                        channelTitle={channelTitle}
                        isTasteShiftTarget={isTasteShiftTarget}
                        activeTasteShiftCategory={tasteShiftConfig?.activeCategoryThisWeek}
                        onSelectVideo={onSelectVideo}
                        onOpenDemoPlayer={onOpenDemoPlayer}
                        onTasteReacted={() => void loadVideos(true)}
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Virtualized unbounded feed using virtua WindowVirtualizer */
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <WindowVirtualizer bufferSize={600} itemSize={320} shift={false}>
                  {videoRows.map((row, rowIndex) => (
                    <div
                      key={`row-${row[0]?.videoId || rowIndex}`}
                      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6 pb-4 sm:pb-5 lg:pb-6"
                    >
                      {row.map((video) => {
                        const channelInfo = channelMap.get(video.channelId);
                        const channelTitle = channelInfo?.title || 'قناة أطفال';
                        const videoCats =
                          channelInfo?.categories ||
                          (video as any).categories ||
                          (video as any).category ||
                          [];
                        const isTasteShiftTarget = Boolean(
                          tasteTargetSet &&
                            (Array.isArray(videoCats) ? videoCats : [videoCats]).some((cat: string) =>
                              tasteTargetSet.has(cat)
                            )
                        );

                        return (
                          <VideoCard
                            key={video.videoId}
                            video={video}
                            channelTitle={channelTitle}
                            isTasteShiftTarget={isTasteShiftTarget}
                            activeTasteShiftCategory={tasteShiftConfig?.activeCategoryThisWeek}
                            onSelectVideo={onSelectVideo}
                            onOpenDemoPlayer={onOpenDemoPlayer}
                            onTasteReacted={() => void loadVideos(true)}
                          />
                        );
                      })}
                    </div>
                  ))}
                </WindowVirtualizer>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Friendly Bottom Footer (No YouTube Wordmark) */}
      <footer className="py-5 border-t border-amber-100/60 text-center text-xs font-medium text-stone-400">
        مساحة ترفيهية وتعليمية آمنة للصغار 🌟
      </footer>
    </div>
  );
}
