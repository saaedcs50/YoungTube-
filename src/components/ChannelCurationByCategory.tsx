import React, { useState, useEffect, useCallback, useMemo } from 'react';
import db, { Channel } from '../db';
import { KidCategory, matchCategory } from '../data/categoryRegistry';
import { useAllCategories } from '../hooks/useAllCategories';
import { syncSingleChannelRss } from '../filtering';
import { WORKER_URL } from '../config';
import { YoutubeSearchBar } from './YoutubeSearchBar';
import { CustomCategoryManager } from './CustomCategoryManager';
import { AddByUrlCard } from './AddByUrlCard';
import { listRegistryChannels } from '../data/channelRegistry';
import {
  FolderKanban,
  ChevronDown,
  ChevronUp,
  Tv,
  ListVideo,
  Check,
  Search,
  Sliders,
  Sparkles,
  HelpCircle,
  Layers,
  RefreshCw,
} from 'lucide-react';

interface ChannelCurationByCategoryProps {
  onChannelChanged?: () => void;
}

export const ChannelCurationByCategory: React.FC<ChannelCurationByCategoryProps> = ({
  onChannelChanged,
}) => {
  const { curationCategories } = useAllCategories();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => {
    // Start collapsed except the first category
    return new Set(['stories']);
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshingSourceId, setRefreshingSourceId] = useState<string | null>(null);
  const [refreshStatusMap, setRefreshStatusMap] = useState<
    Record<string, { message?: string; error?: string }>
  >({});
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(() => new Set());

  const handleRefreshCustomChannel = async (channel: Channel) => {
    if (!channel.sourceId) return;
    setRefreshingSourceId(channel.sourceId);
    setRefreshStatusMap((prev) => ({ ...prev, [channel.sourceId]: {} }));

    // Fire deepen=1 request to update KV archive with family key if available
    void (async () => {
      try {
        const settings = await db.settings.get('main');
        const headers: Record<string, string> = {};
        if (settings?.familyYoutubeApiKey) {
          headers['X-Family-Youtube-Key'] = settings.familyYoutubeApiKey;
        }
        const deepenUrl = `${WORKER_URL}/api/channel-archive?id=${encodeURIComponent(channel.sourceId)}&sourceType=${encodeURIComponent(channel.sourceType || 'channel')}&deepen=1&max=500`;
        await fetch(deepenUrl, { headers });
      } catch {
        // Ignore deepen error
      }
    })();

    const res = await syncSingleChannelRss(
      channel.sourceType || 'channel',
      channel.sourceId,
      channel.title
    );

    setRefreshingSourceId(null);
    if (res.success) {
      setRefreshStatusMap((prev) => ({
        ...prev,
        [channel.sourceId]: { message: `تم — ${res.count} فيديو جاهز` },
      }));
      onChannelChanged?.();
    } else {
      setRefreshStatusMap((prev) => ({
        ...prev,
        [channel.sourceId]: { error: res.error || 'فشل التحديث' },
      }));
    }
  };

  const loadChannels = useCallback(async () => {
    try {
      const merged = await listRegistryChannels();
      setChannels(merged);
    } catch (err) {
      console.error('Failed to load channels in ChannelCurationByCategory:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const handleChannelAdded = useCallback(() => {
    loadChannels();
    onChannelChanged?.();
  }, [loadChannels, onChannelChanged]);

  const handleToggleEnabled = async (channel: Channel) => {
    const nextState = !channel.enabled;

    // Optimistic local update
    setChannels((prev) =>
      prev.map((c) => (c.sourceId === channel.sourceId ? { ...c, enabled: nextState } : c))
    );

    try {
      const existing = await db.channels.where('sourceId').equals(channel.sourceId).first();

      if (existing && existing.id) {
        if (nextState && channel.isPreloaded) {
          // Revert to default seed enabled by deleting the override row
          await db.channels.delete(existing.id);
        } else {
          await db.channels.update(existing.id, { enabled: nextState });
        }
      } else {
        // Pure-seed channel with no Dexie row yet
        if (!nextState) {
          if (!channel.sourceId.startsWith('@')) {
            await db.channels.add({
              sourceType: channel.sourceType || 'channel',
              sourceId: channel.sourceId,
              title: channel.title,
              thumbnail: channel.thumbnail,
              category: channel.category || [],
              isPreloaded: true,
              enabled: false,
            });
          }
        }
      }

      await loadChannels();
      onChannelChanged?.();
    } catch (err) {
      console.error('Failed to update channel enabled state:', err);
      // Revert on failure
      loadChannels();
    }
  };

  const toggleCategoryCollapse = (catId: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        next.add(catId);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allIds = new Set(curationCategories.map((c) => c.id));
    allIds.add('uncategorized');
    setOpenCategories(allIds);
  };

  const collapseAll = () => {
    setOpenCategories(new Set());
  };

  // Filter channels by search text if provided
  const filteredChannels = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter((c) => c.title.toLowerCase().includes(q) || c.sourceId.toLowerCase().includes(q));
  }, [channels, filterQuery]);

  // Group channels by category
  const categorizedChannels = useMemo(() => {
    const map: Record<string, Channel[]> = {};
    for (const cat of curationCategories) {
      map[cat.id] = [];
    }
    const uncategorized: Channel[] = [];

    for (const ch of filteredChannels) {
      const cats = ch.category || [];
      if (cats.length === 0) {
        uncategorized.push(ch);
      } else {
        let matched = false;
        for (const cat of curationCategories) {
          if (matchCategory(cats, cat.id)) {
            map[cat.id].push(ch);
            matched = true;
          }
        }
        if (!matched) {
          uncategorized.push(ch);
        }
      }
    }

    return { map, uncategorized };
  }, [filteredChannels, curationCategories]);

  return (
    <div id="channel-curation-by-category" className="space-y-5 max-w-4xl mx-auto">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-yt-border">
        <div>
          <h3 className="text-base sm:text-lg font-extrabold text-yt-text flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-yt-brand text-yt-brand-text flex items-center justify-center shrink-0 shadow-sm">
              <FolderKanban className="w-4 h-4" />
            </span>
            <span>تنظيم وتصنيف القنوات والبحث</span>
          </h3>
          <p className="text-xs sm:text-sm text-yt-text-muted mt-1">
            البحث عن قنوات جديدة بمفتاح عائلتك، وتخصيص تفعيل أو إيقاف أي قناة في كل قسم تصنيفي للأطفال.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs self-start sm:self-auto">
          <span className="text-yt-text bg-yt-surface px-3 py-1 rounded-xl font-bold border border-yt-border shadow-sm">
            إجمالي القنوات: {channels.length}
          </span>
          <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl font-bold">
            المفعلة: {channels.filter((c) => c.enabled).length}
          </span>
        </div>
      </div>

      {/* 0. Custom Category Creation & Management */}
      <CustomCategoryManager onChanged={handleChannelAdded} />

      {/* 1. Add Channel By URL / Handle Card */}
      <AddByUrlCard target="channel" onAdded={handleChannelAdded} />

      {/* 2. YouTube Search Bar Component at Top */}
      <div className="p-4 sm:p-5 rounded-2xl bg-yt-surface border border-yt-border shadow-sm">
        <YoutubeSearchBar onChannelAdded={handleChannelAdded} />
      </div>

      {/* 2. Filter & Expand / Collapse Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div className="relative max-w-xs w-full">
          <input
            id="curation-channel-filter-input"
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="تصفية القنوات بالاسم..."
            className="w-full min-h-[44px] pl-3.5 pr-9 py-2.5 text-xs sm:text-sm rounded-xl border border-yt-border bg-yt-surface hover:border-yt-brand focus:bg-yt-surface text-yt-text focus:outline-hidden focus:ring-2 focus:ring-yt-brand/30 focus:border-yt-brand transition shadow-sm"
          />
          <Search className="w-4 h-4 text-yt-text-muted absolute right-3 top-3.5 pointer-events-none" />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="min-h-[44px] sm:min-h-[38px] px-4 py-2 text-xs font-bold rounded-xl text-yt-text-muted hover:text-yt-text bg-yt-surface hover:bg-yt-surface-muted border border-yt-border transition cursor-pointer shadow-sm"
          >
            فتح الكل
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="min-h-[44px] sm:min-h-[38px] px-4 py-2 text-xs font-bold rounded-xl text-yt-text-muted hover:text-yt-text bg-yt-surface hover:bg-yt-surface-muted border border-yt-border transition cursor-pointer shadow-sm"
          >
            طي الكل
          </button>
        </div>
      </div>

      {/* 3. Collapsible Category Sections */}
      {isLoading ? (
        <div className="py-12 text-center text-xs text-yt-text-muted">
          جاري تحميل القنوات وتصنيفاتها...
        </div>
      ) : (
        <div className="space-y-3">
          {curationCategories.map((cat: KidCategory) => {
            const list = categorizedChannels.map[cat.id] || [];
            const isOpen = openCategories.has(cat.id);
            const enabledCount = list.filter((c) => c.enabled).length;

            return (
              <div
                key={cat.id}
                id={`curation-cat-group-${cat.id}`}
                className="rounded-2xl border border-yt-border bg-yt-surface overflow-hidden shadow-sm transition"
              >
                {/* Collapsible Header */}
                <button
                  type="button"
                  onClick={() => toggleCategoryCollapse(cat.id)}
                  className="w-full min-h-[52px] flex items-center justify-between p-3.5 sm:p-4 hover:bg-yt-surface-muted transition text-right cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl shrink-0 p-1.5 rounded-xl bg-yt-surface-muted">
                      {cat.emoji}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs sm:text-sm font-bold text-yt-text">
                          {cat.label}
                        </h4>
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-yt-surface-muted text-yt-text-muted font-semibold border border-yt-border">
                          {list.length} {list.length === 1 ? 'قناة' : 'قنوات'}
                        </span>
                        {list.length > 0 && enabledCount < list.length && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-yt-brand-soft text-yt-brand border border-yt-brand/30 font-semibold">
                            {list.length - enabledCount} موقوفة
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-yt-text-muted hidden sm:block mt-0.5">
                        {cat.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-yt-text-muted">
                    <span className="text-xs hidden sm:inline font-medium">
                      {isOpen ? 'إخفاء' : 'عرض'}
                    </span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-yt-text-muted" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-yt-text-muted" />
                    )}
                  </div>
                </button>

                {/* Collapsible Content */}
                {isOpen && (
                  <div className="p-3 sm:p-4 border-t border-yt-border bg-yt-surface-muted/30">
                    {list.length === 0 ? (
                      <div className="py-6 text-center text-xs text-yt-text-muted">
                        لا توجد قنوات في هذا التصنيف حالياً. يمكنك البحث بالأعلى وإضافة قنوات جديدة.
                      </div>
                    ) : (
                      <div className="divide-y divide-yt-border">
                        {list.map((channel) => (
                          <div
                            key={`${cat.id}-${channel.sourceId}`}
                            className="py-3 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {channel.thumbnail && !failedThumbnails.has(channel.sourceId) ? (
                                <img
                                  src={channel.thumbnail}
                                  alt={channel.title}
                                  className="w-10 h-10 rounded-xl object-cover shrink-0 bg-yt-surface-muted border border-yt-border"
                                  referrerPolicy="no-referrer"
                                  onError={() => {
                                    setFailedThumbnails((prev) => {
                                      const next = new Set(prev);
                                      next.add(channel.sourceId);
                                      return next;
                                    });
                                  }}
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-yt-surface-muted text-yt-text-muted flex items-center justify-center shrink-0 border border-yt-border">
                                  {channel.sourceType === 'playlist' ? (
                                    <ListVideo className="w-5 h-5" />
                                  ) : (
                                    <Tv className="w-5 h-5" />
                                  )}
                                </div>
                              )}

                              <div className="min-w-0">
                                <span
                                  className={`text-xs sm:text-sm font-semibold block truncate leading-snug ${
                                    channel.enabled ? 'text-yt-text' : 'text-yt-text-muted line-through'
                                  }`}
                                  title={channel.title}
                                >
                                  {channel.title}
                                </span>
                                <div className="flex items-center gap-1.5 text-[11px] text-yt-text-muted mt-0.5">
                                  <span>{channel.sourceType === 'playlist' ? 'قائمة تشغيل' : 'قناة'}</span>
                                  <span>•</span>
                                  <span>{channel.isPreloaded ? 'مضمّنة' : 'مخصصة'}</span>
                                </div>
                              </div>
                            </div>

                            {/* Actions & Toggle Switch */}
                            <div className="flex items-center gap-2 shrink-0">
                              {/* Manual Refresh Button for Custom (Non-Seed) Channels */}
                              {!channel.isPreloaded && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    id={`refresh-channel-${channel.sourceId}`}
                                    type="button"
                                    onClick={() => handleRefreshCustomChannel(channel)}
                                    disabled={refreshingSourceId === channel.sourceId}
                                    className="min-h-[38px] px-3 py-1 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                                    title="تحديث الفيديوهات من يوتيوب"
                                  >
                                    <RefreshCw
                                      className={`w-3.5 h-3.5 ${
                                        refreshingSourceId === channel.sourceId ? 'animate-spin text-sky-600' : ''
                                      }`}
                                    />
                                    <span>تحديث الفيديوهات</span>
                                  </button>
                                  {refreshStatusMap[channel.sourceId]?.message && (
                                    <span className="text-[10px] text-emerald-700 font-medium">
                                      {refreshStatusMap[channel.sourceId].message}
                                    </span>
                                  )}
                                  {refreshStatusMap[channel.sourceId]?.error && (
                                    <span className="text-[10px] text-rose-600 font-medium">
                                      {refreshStatusMap[channel.sourceId].error}
                                    </span>
                                  )}
                                </div>
                              )}

                              <span
                                className={`text-xs font-semibold hidden sm:inline ${
                                  channel.enabled ? 'text-emerald-700' : 'text-yt-text-muted'
                                }`}
                              >
                                {channel.enabled ? 'مفعلة' : 'معطلة'}
                              </span>

                              <button
                                id={`toggle-channel-${channel.id || channel.sourceId}-${cat.id}`}
                                type="button"
                                role="switch"
                                aria-checked={channel.enabled}
                                onClick={() => handleToggleEnabled(channel)}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                                  channel.enabled ? 'bg-emerald-600' : 'bg-yt-border'
                                }`}
                                title={channel.enabled ? 'تعطيل القناة' : 'تفعيل القناة'}
                              >
                                <span
                                  aria-hidden="true"
                                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                    channel.enabled ? '-translate-x-5' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Uncategorized channels group (if any) */}
          {categorizedChannels.uncategorized.length > 0 && (
            <div
              id="curation-cat-group-uncategorized"
              className="rounded-2xl border border-yt-border bg-yt-surface overflow-hidden shadow-sm transition"
            >
              <button
                type="button"
                onClick={() => toggleCategoryCollapse('uncategorized')}
                className="w-full min-h-[52px] flex items-center justify-between p-3.5 sm:p-4 hover:bg-yt-surface-muted transition text-right cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl shrink-0 p-1.5 rounded-xl bg-yt-brand-soft text-yt-brand">
                    <Layers className="w-5 h-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs sm:text-sm font-bold text-yt-text">
                        قنوات غير مصنفة أو مضافة حديثاً
                      </h4>
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-yt-brand-soft text-yt-text font-semibold border border-yt-brand/30">
                        {categorizedChannels.uncategorized.length}
                      </span>
                    </div>
                    <p className="text-[11px] text-yt-text-muted hidden sm:block mt-0.5">
                      قنوات لم يتم تعيين تصنيف لها بعد. يمكنك تفعيلها أو تعطيلها هنا.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-yt-text-muted">
                  <span className="text-xs hidden sm:inline font-medium">
                    {openCategories.has('uncategorized') ? 'إخفاء' : 'عرض'}
                  </span>
                  {openCategories.has('uncategorized') ? (
                    <ChevronUp className="w-4 h-4 text-yt-text-muted" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-yt-text-muted" />
                  )}
                </div>
              </button>

              {openCategories.has('uncategorized') && (
                <div className="p-3 sm:p-4 border-t border-yt-border bg-yt-surface-muted/30">
                  <div className="divide-y divide-yt-border">
                    {categorizedChannels.uncategorized.map((channel) => (
                      <div
                        key={`uncat-${channel.sourceId}`}
                        className="py-3 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {channel.thumbnail && !failedThumbnails.has(channel.sourceId) ? (
                            <img
                              src={channel.thumbnail}
                              alt={channel.title}
                              className="w-10 h-10 rounded-xl object-cover shrink-0 bg-yt-surface-muted border border-yt-border"
                              referrerPolicy="no-referrer"
                              onError={() => {
                                setFailedThumbnails((prev) => {
                                  const next = new Set(prev);
                                  next.add(channel.sourceId);
                                  return next;
                                });
                              }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-yt-surface-muted text-yt-text-muted flex items-center justify-center shrink-0 border border-yt-border">
                              <Tv className="w-5 h-5" />
                            </div>
                          )}

                          <div className="min-w-0">
                            <span
                              className={`text-xs sm:text-sm font-semibold block truncate leading-snug ${
                                channel.enabled ? 'text-yt-text' : 'text-yt-text-muted line-through'
                              }`}
                              title={channel.title}
                            >
                              {channel.title}
                            </span>
                            <span className="text-[11px] text-yt-brand block mt-0.5">
                              يحتاج لتصنيف في نتائج البحث بالأعلى
                            </span>
                          </div>
                        </div>

                        {/* Actions & Toggle Switch */}
                        <div className="flex items-center gap-2 shrink-0">
                          {!channel.isPreloaded && (
                            <div className="flex items-center gap-1.5">
                              <button
                                id={`refresh-channel-${channel.sourceId}-uncat`}
                                type="button"
                                onClick={() => handleRefreshCustomChannel(channel)}
                                disabled={refreshingSourceId === channel.sourceId}
                                className="min-h-[38px] px-3 py-1 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                                title="تحديث الفيديوهات من يوتيوب"
                              >
                                <RefreshCw
                                  className={`w-3.5 h-3.5 ${
                                    refreshingSourceId === channel.sourceId ? 'animate-spin text-sky-600' : ''
                                  }`}
                                />
                                <span>تحديث الفيديوهات</span>
                              </button>
                              {refreshStatusMap[channel.sourceId]?.message && (
                                <span className="text-[10px] text-emerald-700 font-medium">
                                  {refreshStatusMap[channel.sourceId].message}
                                </span>
                              )}
                              {refreshStatusMap[channel.sourceId]?.error && (
                                <span className="text-[10px] text-rose-600 font-medium">
                                  {refreshStatusMap[channel.sourceId].error}
                                </span>
                              )}
                            </div>
                          )}

                          <span
                            className={`text-xs font-semibold hidden sm:inline ${
                              channel.enabled ? 'text-emerald-700' : 'text-yt-text-muted'
                            }`}
                          >
                            {channel.enabled ? 'مفعلة' : 'معطلة'}
                          </span>

                          <button
                            id={`toggle-channel-${channel.id || channel.sourceId}-uncat`}
                            type="button"
                            role="switch"
                            aria-checked={channel.enabled}
                            onClick={() => handleToggleEnabled(channel)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                              channel.enabled ? 'bg-emerald-600' : 'bg-yt-border'
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                channel.enabled ? '-translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
