import React, { useEffect, useState, useMemo, useCallback } from 'react';
import db, { FeedItem, Channel } from '../db';
import channelsSeed from '../../channels_seed.json';
import { useAllCategories } from '../hooks/useAllCategories';
import { ensureChannelsArchiveSynced } from '../filtering';
import { WeeklyChoiceCard } from '../components/WeeklyChoiceCard';
import { TasteReactionBar } from '../components/TasteReactionBar';
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
    videoId: 'X_1g1z1b0a8',
    channelId: 'UCf_8ZTFvJeS8U60W8C8PGhA', // Puffin Rock (Barefoot Books / calm)
    title: 'Puffin Rock - حكايات الطبيعة الهادئة والمغامرات الودية الجميلة',
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

// Fisher-Yates shuffle to randomize video order on fresh app mount
function shuffleVideos(array: FeedItem[]): FeedItem[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
  const result: FeedItem[] = [];
  const extrasToTrim: string[] = [];
  for (let i = 0; i < enabledChannelIds.length; i += QUERY_CHUNK) {
    const chunk = enabledChannelIds.slice(i, i + QUERY_CHUNK);
    const rows = await db.feedCache.where('channelId').anyOf(chunk).toArray();
    const byChannel = new Map<string, FeedItem[]>();
    for (const row of rows) {
      if (row.hidden === true) continue;
      if (hideMusicVideos && row.hasMusic === true) continue;
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

export default function KidHomeScreen({
  onOpenParentDashboard,
  onOpenDemoPlayer,
  onSelectVideo,
  refreshTrigger = 0,
  suppressedVideoIds = [],
}: KidHomeScreenProps) {
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

      // Map of disabled vs enabled channel IDs
      const disabledChannelIds = new Set(
        storedChannels.filter((c) => c.enabled === false).map((c) => c.sourceId)
      );

      const enabledChannelIds = Array.from(
        new Set([
          ...storedChannels.filter((c) => c.enabled !== false).map((c) => c.sourceId),
          ...(channelsSeed as any[]).map((c) => c.sourceId),
        ])
      ).filter((id) => !disabledChannelIds.has(id));

      const hideMusicVideos = settings?.hideMusicVideos === true;

      let availableVideos: FeedItem[] = [];
      if (enabledChannelIds.length > 0) {
        availableVideos = await loadBoundedFeed(enabledChannelIds, hideMusicVideos);
      }

      // If feedCache is empty, seed initial curated safe videos
      if (availableVideos.length === 0) {
        const totalCacheCount = await db.feedCache.count();
        if (totalCacheCount === 0) {
          await db.feedCache.bulkPut(STARTER_VIDEOS);
          availableVideos = hideMusicVideos
            ? STARTER_VIDEOS.filter((v) => v.hasMusic !== true)
            : STARTER_VIDEOS;
        }
      }

      // Taste Shift Feed Composition Logic (Phase B: effectiveShare + cooldown)
      const tasteShift = settings?.tasteShift as TasteShiftConfig | undefined;
      if (!tasteShift?.enabled || !tasteShift.targetCategories || tasteShift.targetCategories.length === 0) {
        setTasteShiftConfig(null);
        setVideos((prev) => {
          if (prev.length === 0) return shuffleVideos(availableVideos);
          const nextIds = new Set(availableVideos.map((v) => v.videoId));
          const kept = prev.filter((v) => nextIds.has(v.videoId));
          const keptIds = new Set(kept.map((v) => v.videoId));
          const added = availableVideos.filter((v) => !keptIds.has(v.videoId));
          return added.length > 0 ? [...kept, ...shuffleVideos(added)] : kept;
        });
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

        const keepOrder = (list: FeedItem[]) => {
          setVideos((prev) => {
            if (prev.length === 0) return shuffleVideos(list);
            const nextIds = new Set(list.map((v) => v.videoId));
            const kept = prev.filter((v) => nextIds.has(v.videoId));
            const keptIds = new Set(kept.map((v) => v.videoId));
            const added = list.filter((v) => !keptIds.has(v.videoId));
            return added.length > 0 ? [...kept, ...shuffleVideos(added)] : kept;
          });
        };

        if (!activeCategory) {
          keepOrder(availableVideos);
        } else {
          const catState = getOrInitCategoryState(tasteShift, activeCategory, baseShare);
          if (isCategoryInCooldown(catState)) {
            // Hard reject cooldown: serve normal feed without target mix
            keepOrder(availableVideos);
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
            const shuffledTarget = shuffleVideos(targetPool);
            const shuffledRest = shuffleVideos(restPool);
            const takeTargetCount = Math.min(targetCount, shuffledTarget.length);
            const takeRestCount = availableVideos.length - takeTargetCount;
            const chosenTarget = shuffledTarget.slice(0, takeTargetCount);
            const chosenRest = shuffledRest.slice(0, Math.max(0, takeRestCount));
            // Phase C: 2 familiar + 1 new (no full reshuffle — keeps the bridge pattern)
            const combined = bridgeInterleave(chosenRest, chosenTarget, 2);
            setVideos(combined);

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
      setVideos((prev) => (prev.length > 0 ? prev : shuffleVideos(STARTER_VIDEOS)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos, refreshTrigger]);

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

  const suppressedSet = useMemo(() => new Set(suppressedVideoIds), [suppressedVideoIds]);

  // 2.5 Load favorites videos (liked videos) with strict safety filters
  const loadFavorites = useCallback(async () => {
    try {
      const [interactions, storedChannels, settings] = await Promise.all([
        db.interactions
          .filter((i) => i.parentRating === 'liked' || i.childReaction === 'liked')
          .toArray(),
        db.channels.toArray(),
        db.settings.get('main'),
      ]);

      interactions.sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0));

      const disabledChannelIds = new Set(
        storedChannels.filter((c) => c.enabled === false).map((c) => c.sourceId)
      );

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
        if (targetChannelId && disabledChannelIds.has(targetChannelId)) continue;

        if (hideMusicVideos && cached?.hasMusic === true) continue;

        safeList.push({
          videoId: inter.videoId,
          channelId: targetChannelId || 'unknown',
          title: inter.title || cached?.title || 'فيديو أطفال',
          hasMusic: cached?.hasMusic,
          fetchedAt: inter.lastWatched || Date.now(),
          hidden: false,
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
        if (!channelInfo) return false;
        return channelInfo.categories.includes(selectedCategory);
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

  return (
    <div
      id="kid-home-screen"
      className="min-h-screen bg-[#FAF8F5] text-stone-800 flex flex-col select-none font-sans"
    >
      {/* 1. Header Bar: Friendly Brand + Small Parent Access Icon */}
      <header className="sticky top-0 z-40 bg-[#FAF8F5]/90 backdrop-blur-md border-b border-stone-200/60 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo & Brand: Distinct Warm Palette, No Red, No YouTube Branding */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-stone-800 tracking-tight flex items-center gap-1.5">
                <span>{childName ? `عالم ${childName}` : 'عالم الصغار'}</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  آمن ونظيف
                </span>
              </h1>
              <p className="text-xs text-stone-500 hidden sm:block">
                محتوى مختار بعناية وبدون إعلانات مزعجة
              </p>
            </div>
          </div>

          {/* Unobtrusive Parent Zone Trigger (Small, in the corner) */}
          <div className="flex items-center gap-2">
            {onOpenDemoPlayer && (
              <button
                id="kid-header-demo-player-btn"
                type="button"
                onClick={onOpenDemoPlayer}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-900 hover:bg-black text-white text-xs font-bold transition shadow-xs active:scale-95 cursor-pointer"
                title="تجربة المشغل (Player Shell)"
              >
                <Play className="w-3.5 h-3.5 fill-current text-amber-400" />
                <span>تجربة المشغل</span>
              </button>
            )}

            <button
              id="parent-dashboard-lock-btn"
              type="button"
              onClick={onOpenParentDashboard}
              className="p-2.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 active:scale-95 transition cursor-pointer"
              title="منطقة الوالدين (PIN)"
              aria-label="منطقة الوالدين"
            >
              <Lock className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Category Filter Chips (13 Built-in + Custom Categories + All) */}
      <section className="bg-[#FAF8F5] border-b border-stone-200/40 px-4 sm:px-8 py-3">
        <div className="max-w-7xl mx-auto space-y-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {/* Child-facing "المفضلة" (Favorites) button */}
            <button
              id="kid-favorites-toggle-btn"
              type="button"
              onClick={() => {
                setShowFavorites((prev) => !prev);
              }}
              className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition active:scale-95 cursor-pointer shadow-xs ${
                showFavorites
                  ? 'bg-rose-500 text-white shadow-rose-200 ring-2 ring-rose-300'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
              }`}
              title="فيديوهاتي المفضلة"
            >
              <Heart
                className={`w-4 h-4 ${
                  showFavorites ? 'fill-white text-white' : 'fill-rose-500 text-rose-500'
                }`}
              />
              <span>المفضلة</span>
              {favoritesCount > 0 && (
                <span
                  className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                    showFavorites ? 'bg-white/20 text-white' : 'bg-rose-200 text-rose-800'
                  }`}
                >
                  {favoritesCount}
                </span>
              )}
            </button>

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
                  }}
                  className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition active:scale-95 cursor-pointer ${
                    isActive
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-white text-stone-600 border border-stone-200/80 hover:bg-amber-50/50 hover:border-amber-300'
                  }`}
                >
                  <span>{cat.emoji}</span>
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* 2.5 In-Feed Search Bar (Client-side Only on Allowed Cached Videos) */}
          <div className="relative max-w-lg">
            <div className="relative flex items-center">
              <input
                id="kid-feed-search-input"
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="ابحث في الفيديوهات المسموحة..."
                className="w-full pl-10 pr-10 py-2 rounded-2xl bg-white border border-stone-200/90 text-xs sm:text-sm text-stone-800 placeholder-stone-400 focus:outline-hidden focus:ring-2 focus:ring-amber-400/80 focus:border-amber-400 transition shadow-2xs"
              />
              <div className="absolute right-3.5 text-stone-400 pointer-events-none flex items-center justify-center">
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
      </section>

      {/* 3. Main Video Grid */}
      <main className="grow w-full py-4 sm:py-6">
        {showFavorites ? (
          <div id="kid-favorites-view" className="space-y-6">
            {/* Header banner with back button */}
            <div className="px-4 sm:px-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-3xl border border-rose-100 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0 border border-rose-100">
                    <Heart className="w-6 h-6 fill-rose-500" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-stone-800 flex items-center gap-2">
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
                  className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs sm:text-sm font-bold transition active:scale-95 cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>العودة للفيديوهات</span>
                </button>
              </div>
            </div>

            {/* Favorites Video Grid or Empty State */}
            {filteredFavorites.length === 0 ? (
              debouncedSearch ? (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 px-4 sm:px-8">
                  <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto">
                    <Search className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base sm:text-lg font-bold text-stone-800">
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
                    className="px-5 py-2.5 rounded-full bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                  >
                    عرض كل الفيديوهات المفضلة ❤️
                  </button>
                </div>
              ) : (
                /* Empty state, kid-friendly tone specified by user */
                <div
                  id="kid-favorites-empty-state"
                  className="flex flex-col items-center justify-center py-20 text-center space-y-4 px-4 sm:px-8"
                >
                  <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto border border-rose-100 shadow-xs">
                    <Heart className="w-8 h-8 fill-rose-500" />
                  </div>
                  <div className="space-y-1.5 max-w-md mx-auto">
                    <h3 className="text-base sm:text-lg font-bold text-stone-800">
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
                    className="px-6 py-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm font-bold transition shadow-xs cursor-pointer active:scale-95 flex items-center gap-1.5"
                  >
                    <ArrowRight className="w-4 h-4" />
                    <span>العودة للفيديوهات</span>
                  </button>
                </div>
              )
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-0 gap-y-4 sm:gap-y-6">
                {filteredFavorites.map((video) => {
                  const channelInfo = channelMap.get(video.channelId);
                  const channelTitle = channelInfo?.title || 'قناة أطفال';
                  const thumbnailUrl = `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;

                  return (
                    <div
                      key={video.videoId}
                      id={`favorite-card-${video.videoId}`}
                      onClick={() => {
                        if (onSelectVideo) {
                          onSelectVideo(video.videoId, video.title, channelInfo?.title, video.channelId);
                        } else if (onOpenDemoPlayer) {
                          onOpenDemoPlayer();
                        }
                      }}
                      className="group bg-white flex flex-col text-right cursor-pointer"
                    >
                      {/* Thumbnail: edge-to-edge, no rounded corners, no play overlay */}
                      <div className="relative aspect-video w-full bg-stone-100 overflow-hidden">
                        <img
                          src={thumbnailUrl}
                          alt={video.title}
                          className="w-full h-full object-cover group-hover:scale-102 transition duration-300"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;
                          }}
                        />

                        {/* Favorite Heart Badge */}
                        <div
                          id={`favorite-badge-${video.videoId}`}
                          className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-rose-500/90 text-white text-[10px] font-bold shadow-xs backdrop-blur-xs flex items-center gap-1 pointer-events-none z-10"
                        >
                          <Heart className="w-3 h-3 fill-white" />
                          <span>مفضلة</span>
                        </div>

                        {/* Optional No Music Badge */}
                        {video.hasMusic === false && (
                          <div className="absolute bottom-2.5 right-2.5 px-2 py-1 rounded-md bg-stone-900/80 text-emerald-300 text-[10px] font-bold flex items-center gap-1 backdrop-blur-xs">
                            <VolumeX className="w-3 h-3" />
                            <span>بدون موسيقى</span>
                          </div>
                        )}
                      </div>

                      {/* Video Details: keep small internal padding so text isn't flush against the edges */}
                      <div className="px-3.5 pt-2.5 pb-3 flex flex-col justify-between grow space-y-1.5">
                        <h3
                          className="text-sm sm:text-base font-bold text-stone-800 line-clamp-2 leading-snug group-hover:text-rose-700 transition"
                          title={video.title}
                        >
                          {video.title}
                        </h3>

                        <div className="flex items-center justify-between text-xs text-stone-500 font-medium pt-0.5">
                          <span className="truncate max-w-[85%] text-stone-600">
                            {channelTitle}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-stone-400 gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
            <span className="text-sm font-medium">جاري تحضير الفيديوهات الممتعة...</span>
          </div>
        ) : filteredVideos.length === 0 ? (
          debouncedSearch ? (
            /* Part A: Friendly Search Empty State */
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 px-4 sm:px-8">
              <div className="w-16 h-16 rounded-3xl bg-amber-100/70 text-amber-700 flex items-center justify-center mx-auto">
                <Search className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base sm:text-lg font-bold text-stone-800">
                  مفيش فيديوهات بالاسم ده جوه القنوات المسموحة
                </h3>
                <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
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
                className="px-5 py-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition shadow-xs cursor-pointer"
              >
                مسح البحث وعرض كل الفيديوهات ✨
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 px-4 sm:px-8">
              <div className="w-16 h-16 rounded-3xl bg-amber-100/60 text-amber-600 flex items-center justify-center mx-auto">
                <Film className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-stone-800">
                  لا توجد فيديوهات في هذا القسم حالياً
                </h3>
                <p className="text-xs text-stone-500 max-w-md mx-auto">
                  يمكنك تصفح باقي الأقسام الممتعة أو العودة لقسم &quot;الكل&quot; لمشاهدة جميع الفيديوهات.
                </p>
              </div>
              <button
                id="reset-filter-btn"
                type="button"
                onClick={() => setSelectedCategory('all')}
                className="px-5 py-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition shadow-xs cursor-pointer"
              >
                عرض جميع الفيديوهات ✨
              </button>
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-0 gap-y-4 sm:gap-y-6">
            {showWeeklyChoiceCard && tasteShiftConfig && (
              <div className="col-span-full px-4 sm:px-8 mb-2">
                <WeeklyChoiceCard
                  targetCategories={tasteShiftConfig.targetCategories}
                  currentWeek={tasteShiftConfig.currentWeek}
                  onChoiceMade={() => loadVideos(true)}
                />
              </div>
            )}
            {filteredVideos.map((video) => {
              const channelInfo = channelMap.get(video.channelId);
              const channelTitle = channelInfo?.title || 'قناة أطفال';
              const thumbnailUrl = `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;

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
                <div
                  key={video.videoId}
                  id={`video-card-${video.videoId}`}
                  onClick={() => {
                    if (onSelectVideo) {
                      onSelectVideo(video.videoId, video.title, channelInfo?.title, video.channelId);
                    } else if (onOpenDemoPlayer) {
                      onOpenDemoPlayer();
                    }
                  }}
                  className="group bg-white flex flex-col text-right cursor-pointer"
                >
                  {/* Thumbnail: edge-to-edge, no rounded corners, no play overlay */}
                  <div className="relative aspect-video w-full bg-stone-100 overflow-hidden">
                    <img
                      src={thumbnailUrl}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-102 transition duration-300"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      onError={(e) => {
                        // Fallback to mqdefault if hqdefault is unavailable
                        (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;
                      }}
                    />

                    {/* Taste Shift "✨ جديد" Badge */}
                    {isTasteShiftTarget && (
                      <div
                        id={`taste-shift-badge-${video.videoId}`}
                        className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-white/90 text-stone-800 text-[10px] font-bold shadow-xs backdrop-blur-xs border border-white/60 pointer-events-none z-10"
                      >
                        ✨ جديد
                      </div>
                    )}

                    {/* Optional No Music Badge */}
                    {video.hasMusic === false && (
                      <div className="absolute bottom-2.5 right-2.5 px-2 py-1 rounded-md bg-stone-900/80 text-emerald-300 text-[10px] font-bold flex items-center gap-1 backdrop-blur-xs">
                        <VolumeX className="w-3 h-3" />
                        <span>بدون موسيقى</span>
                      </div>
                    )}
                  </div>

                  {/* Video Details: keep small internal padding so text isn't flush against the edges */}
                  <div className="px-3.5 pt-2.5 pb-3 flex flex-col justify-between grow space-y-1.5">
                    <h3
                      className="text-sm sm:text-base font-bold text-stone-800 line-clamp-2 leading-snug group-hover:text-amber-800 transition"
                      title={video.title}
                    >
                      {video.title}
                    </h3>

                    <div className="flex items-center justify-between text-xs text-stone-500 font-medium pt-0.5">
                      <span className="truncate max-w-[85%] text-stone-600">
                        {channelTitle}
                      </span>
                    </div>
                    {isTasteShiftTarget && tasteShiftConfig?.activeCategoryThisWeek && (
                      <TasteReactionBar
                        videoId={video.videoId}
                        channelId={video.channelId}
                        title={video.title}
                        categoryId={tasteShiftConfig.activeCategoryThisWeek}
                        onReacted={() => {
                          // Soft refresh so effectiveShare updates on next mix
                          void loadVideos(true);
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Friendly Bottom Footer (No YouTube Wordmark) */}
      <footer className="py-4 border-t border-stone-200/60 text-center text-xs text-stone-400">
        مساحة ترفيهية وتعليمية آمنة للصغار
      </footer>
    </div>
  );
}
