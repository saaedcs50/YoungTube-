import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import db, { FeedItem } from '../../db';
import { listRegistryChannels, RegistryChannel } from '../../data/channelRegistry';
import { WORKER_URL } from '../../config';
import { matchCategory } from '../../data/categoryRegistry';
import {
  ensureChannelsArchiveSynced,
  scheduleBackgroundPortraitCheck,
  migrateUnhidePortraitVideos,
} from '../../filtering';
import { loadCachedBlocks, fetchGlobalBlocks } from '../../services/globalBlocks';
import { enrichFeedItemViewCounts } from '../../services/youtubeViewCounts';
import {
  computeBaseShare,
  resolveEffectiveShare,
  isCategoryInCooldown,
  getOrInitCategoryState,
  bridgeInterleave,
} from '../../tasteShiftEngine';
import { logImpressedBatch } from '../../tasteShiftStorage';
import type { TasteShiftConfig } from '../../tasteShiftTypes';

// Built-in starter videos mapped to actual curated channels from registry
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

export interface UseKidFeedOptions {
  refreshTrigger?: number;
  suppressedVideoIds?: string[];
}

export function useKidFeed({ refreshTrigger = 0, suppressedVideoIds = [] }: UseKidFeedOptions) {
  const [videos, setVideos] = useState<FeedItem[]>([]);
  const [registryChannelsList, setRegistryChannelsList] = useState<RegistryChannel[]>([]);
  const [childName, setChildName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [deepSearchResults, setDeepSearchResults] = useState<
    Array<{ videoId: string; title: string; publishedAt: string; sourceId: string }>
  >([]);
  const [isDeepSearching, setIsDeepSearching] = useState(false);

  // Child-facing Favorites view state
  const [showFavorites, setShowFavorites] = useState(false);
  const [favoritesVideos, setFavoritesVideos] = useState<FeedItem[]>([]);
  const [savedAndLovedVideos, setSavedAndLovedVideos] = useState<FeedItem[]>([]);
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
    if (!tasteShiftConfig?.enabled || !tasteShiftConfig.activeCategoryThisWeek) {
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

  // 1. Build channel metadata lookup map from channel registry
  const channelMap = useMemo(() => {
    const map = new Map<
      string,
      { title: string; categories: string[]; thumbnail?: string; enabled?: boolean }
    >();
    for (const ch of registryChannelsList) {
      if (ch.sourceId) {
        map.set(ch.sourceId, {
          title: ch.title || 'قناة أطفال موثوقة',
          categories: Array.isArray(ch.category) ? ch.category : [],
          thumbnail: ch.thumbnail,
          enabled: ch.enabled,
        });
      }
    }
    return map;
  }, [registryChannelsList]);

  // 2. Load safe videos using indexed, bounded query on enabled channels
  const loadVideos = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      await migrateUnhidePortraitVideos().catch(() => {});

      const [registryChannels, settings] = await Promise.all([
        listRegistryChannels(),
        db.settings.get('main'),
      ]);

      if (settings?.childName) {
        setChildName(settings.childName);
      } else {
        setChildName('');
      }

      setRegistryChannelsList(registryChannels);

      const cachedBlocks = loadCachedBlocks();
      const blockedChannelSet = new Set(cachedBlocks.channelIds);

      const enabledChannelIds = registryChannels
        .filter((c) => c.enabled !== false && c.autoDisabled !== true && !blockedChannelSet.has(c.sourceId))
        .map((c) => c.sourceId);

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
            for (const ch of registryChannels) {
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
            (i) =>
              i.childLoved === true ||
              i.childReaction === 'liked' ||
              i.parentRating === 'liked' ||
              i.savedByParent === true
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
      const interMap = new Map(interactions.map((i) => [i.videoId, i]));

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

      // Child-facing favorites list (only items explicitly loved or reacted as liked)
      const safeLovedList = safeList.filter((item) => {
        const inter = interMap.get(item.videoId);
        return (
          inter?.childLoved === true ||
          inter?.childReaction === 'liked' ||
          inter?.parentRating === 'liked'
        );
      });

      setFavoritesVideos(safeLovedList);
      setFavoritesCount(safeLovedList.length);
      setSavedAndLovedVideos(safeList);
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

    // In-feed search (searches approved cached videos, plus saved and loved videos)
    if (debouncedSearch) {
      result = result.filter((video) => {
        const channelInfo = channelMap.get(video.channelId);
        const titleMatch = video.title.toLowerCase().includes(debouncedSearch);
        const channelMatch = channelInfo?.title.toLowerCase().includes(debouncedSearch);
        return titleMatch || channelMatch;
      });

      // Append matching saved/loved results without duplicating any videoId
      if (savedAndLovedVideos.length > 0) {
        const existingIds = new Set(result.map((v) => v.videoId));
        const matchingSavedLoved: FeedItem[] = [];

        for (const item of savedAndLovedVideos) {
          if (existingIds.has(item.videoId)) continue;
          if (suppressedSet.has(item.videoId)) continue;

          // Category filter if active
          if (selectedCategory !== 'all') {
            const channelInfo = channelMap.get(item.channelId);
            const channelCats = channelInfo?.categories || (item as any).categories || (item as any).category;
            if (!matchCategory(channelCats, selectedCategory)) continue;
          }

          const channelInfo = channelMap.get(item.channelId);
          const titleMatch = item.title.toLowerCase().includes(debouncedSearch);
          const channelMatch = channelInfo?.title.toLowerCase().includes(debouncedSearch);

          if (titleMatch || channelMatch) {
            existingIds.add(item.videoId);
            matchingSavedLoved.push(item);
          }
        }

        if (matchingSavedLoved.length > 0) {
          result = [...result, ...matchingSavedLoved];
        }
      }
    }

    return result;
  }, [videos, selectedCategory, debouncedSearch, channelMap, suppressedSet, savedAndLovedVideos]);

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

  // 3.8 Deep search fallback: if local filteredVideos has fewer than 3 results and debouncedSearch has > 2 chars
  useEffect(() => {
    if (!debouncedSearch) {
      setDeepSearchResults([]);
      setIsDeepSearching(false);
      return;
    }

    if (debouncedSearch.length <= 2 || filteredVideos.length >= 3) {
      setDeepSearchResults([]);
      setIsDeepSearching(false);
      return;
    }

    let cancelled = false;
    setIsDeepSearching(true);

    const runDeepSearch = async () => {
      try {
        const res = await fetch(
          `${WORKER_URL}/api/search-archive?q=${encodeURIComponent(debouncedSearch)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        if (data && Array.isArray(data.results)) {
          // Exclude videos already shown in local filteredVideos
          const localIds = new Set(filteredVideos.map((v) => v.videoId));
          const uniqueArchiveResults = data.results.filter(
            (item: any) => !localIds.has(item.videoId)
          );
          setDeepSearchResults(uniqueArchiveResults);
        } else {
          setDeepSearchResults([]);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to deep search archive:', err);
          setDeepSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setIsDeepSearching(false);
        }
      }
    };

    void runDeepSearch();

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, filteredVideos]);

  return {
    videos,
    loading,
    childName,
    selectedCategory,
    setSelectedCategory,
    searchInput,
    setSearchInput,
    debouncedSearch,
    setDebouncedSearch,
    deepSearchResults,
    setDeepSearchResults,
    isDeepSearching,
    showFavorites,
    setShowFavorites,
    favoritesVideos,
    filteredFavorites,
    favoritesCount,
    tasteShiftConfig,
    tasteTargetSet,
    showWeeklyChoiceCard,
    channelMap,
    filteredVideos,
    loadVideos,
    loadFavorites,
  };
}
