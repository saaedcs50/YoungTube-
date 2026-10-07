import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, Download, Heart, History, Lock, ListVideo, UserRound } from 'lucide-react';
import type { ChildPlaylist } from '../../db';
import db from '../../db';
import { listPlaylists } from '../../services/playlists/playlistRepository';
import { listDownloads } from '../../services/downloadManager';

interface Props {
  onOpenFavorites: () => void;
  onOpenDownloads: () => void;
  onOpenHistory: () => void;
  onOpenPlaylists: () => void;
  onOpenParentLock: () => void;
}

export const YouScreen: React.FC<Props> = ({ onOpenFavorites, onOpenDownloads, onOpenHistory, onOpenPlaylists, onOpenParentLock }) => {
  const [childName, setChildName] = useState('');
  const [playlists, setPlaylists] = useState<ChildPlaylist[]>([]);
  const [downloads, setDownloads] = useState(0);
  const [activeDownloads, setActiveDownloads] = useState(0);
  const [hasHistory, setHasHistory] = useState(false);

  const load = useCallback(async () => {
    const [settings, lists, downloadRows, interactions] = await Promise.all([db.settings.get('main'), listPlaylists(), listDownloads(), db.interactions.count()]);
    setChildName(settings?.childName || '');
    setPlaylists(lists);
    setDownloads(downloadRows.length);
    setActiveDownloads(downloadRows.filter((row) => row.status === 'queued' || row.status === 'downloading').length);
    setHasHistory(interactions > 0);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const Row = ({ icon: Icon, title, subtitle, onClick, badge }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle?: string; onClick: () => void; badge?: string }) => (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 p-3.5 rounded-2xl hover:bg-yt-surface-muted text-right cursor-pointer">
      <span className="w-11 h-11 rounded-2xl bg-yt-surface-muted border border-yt-border flex items-center justify-center text-yt-text-muted shrink-0"><Icon className="w-5 h-5" /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{title}</span>{subtitle && <span className="block text-[11px] text-yt-text-muted mt-0.5 truncate">{subtitle}</span>}</span>
      {badge && <span className="px-2 py-1 rounded-full bg-yt-brand-soft text-yt-brand text-[10px] font-bold">{badge}</span>}
      <ChevronLeft className="w-4 h-4 text-yt-text-muted" />
    </button>
  );

  return (
    <section dir="rtl" className="min-h-[calc(100vh-7rem)] max-w-3xl mx-auto px-4 sm:px-6 py-4 pb-28 space-y-5">
      <section className="rounded-3xl border border-yt-border bg-yt-surface p-5">
        <div className="flex items-center gap-3"><div className="w-16 h-16 rounded-full bg-yt-brand-soft border border-yt-brand/20 flex items-center justify-center text-yt-brand text-xl font-black">{childName ? childName.charAt(0) : <UserRound className="w-7 h-7" />}</div><div><p className="text-xs text-yt-text-muted font-bold">أنت</p><h1 className="text-xl font-black">{childName || 'ملف الطفل'}</h1><p className="text-xs text-yt-text-muted mt-1">مكتبتك ومحتواك المحفوظ</p></div></div>
      </section>

      <section className="rounded-3xl border border-yt-border bg-yt-surface divide-y divide-yt-border overflow-hidden">
        <Row icon={Heart} title="المفضلة" subtitle="الفيديوهات التي أحببتها" onClick={onOpenFavorites} />
        <Row icon={ListVideo} title="القوائم" subtitle={playlists.length ? `${playlists.length} قوائم محفوظة` : 'أنشئ قوائم تشغيلك الخاصة'} onClick={onOpenPlaylists} />
        <Row icon={Download} title="التحميلات" subtitle={downloads ? `${downloads} فيديو محفوظ محليًا` : 'المشاهدة بدون إنترنت'} badge={activeDownloads > 0 ? `${activeDownloads} جاري` : undefined} onClick={onOpenDownloads} />
        {hasHistory && <Row icon={History} title="تمت مشاهدته / السجل" subtitle="الفيديوهات التي شاهدتها مؤخرًا" onClick={onOpenHistory} />}
        <Row icon={Lock} title="قفل الأهل" subtitle="إدارة إعدادات الطفل والقنوات" onClick={onOpenParentLock} />
      </section>

      {playlists.length > 0 && <section className="rounded-3xl border border-yt-border bg-yt-surface p-4"><div className="flex items-center justify-between mb-3"><h2 className="text-sm font-black">معاينة القوائم</h2><button type="button" onClick={onOpenPlaylists} className="text-xs font-bold text-yt-brand cursor-pointer">عرض الكل</button></div><div className="flex gap-2 overflow-x-auto scrollbar-none">{playlists.slice(0,3).map((playlist) => <div key={playlist.id} className="shrink-0 w-44 rounded-2xl border border-yt-border overflow-hidden"><div className="aspect-video bg-yt-surface-muted">{playlist.thumbnailVideoId && <img src={`https://i.ytimg.com/vi/${playlist.thumbnailVideoId}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" />}</div><div className="p-2.5"><div className="text-xs font-bold truncate">{playlist.name}</div></div></div>)}</div></section>}
    </section>
  );
};

export default YouScreen;
