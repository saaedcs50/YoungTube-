import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Check,
  Sliders,
  Gauge,
  Subtitles,
  Volume2,
  AlertCircle,
} from 'lucide-react';
import type { YouTubePlayer } from 'react-youtube';

export interface PlayerSettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  player: YouTubePlayer | null;
}

const QUALITY_LABELS: Record<string, string> = {
  highres: 'عالية جداً (Highres)',
  hd2160: '2160p (4K)',
  hd1440: '1440p (QHD)',
  hd1080: '1080p (Full HD)',
  hd720: '720p (HD)',
  large: '480p',
  medium: '360p',
  small: '240p',
  tiny: '144p',
  auto: 'تلقائي',
};

const DEFAULT_QUALITIES = ['auto', 'hd1080', 'hd720', 'large', 'medium', 'small'];

const SPEED_OPTIONS: { value: number; label: string }[] = [
  { value: 0.25, label: '0.25x' },
  { value: 0.5, label: '0.5x' },
  { value: 0.75, label: '0.75x' },
  { value: 1, label: 'عادي (1x)' },
  { value: 1.25, label: '1.25x' },
  { value: 1.5, label: '1.5x' },
  { value: 1.75, label: '1.75x' },
  { value: 2, label: '2x' },
];

export const PlayerSettingsSheet: React.FC<PlayerSettingsSheetProps> = ({
  isOpen,
  onClose,
  player,
}) => {
  // Quality states
  const [qualities, setQualities] = useState<string[]>(DEFAULT_QUALITIES);
  const [activeQuality, setActiveQuality] = useState<string>('auto');
  const [qualityWarning, setQualityWarning] = useState<string | null>(null);
  const qualityCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Speed states
  const [currentSpeed, setCurrentSpeed] = useState<number>(1);

  // Captions states
  const [captionTracks, setCaptionTracks] = useState<any[]>([]);
  const [activeCaptionCode, setActiveCaptionCode] = useState<string>('off');

  // Audio track states
  const [audioTracks, setAudioTracks] = useState<any[]>([]);
  const [activeAudioTrackId, setActiveAudioTrackId] = useState<string>('');

  // Read current player settings whenever sheet opens or player changes
  useEffect(() => {
    if (!isOpen || !player) return;

    // 1. Fetch available & active quality
    try {
      const avail = player.getAvailableQualityLevels?.();
      if (Array.isArray(avail) && avail.length > 0) {
        setQualities(avail);
      } else {
        setQualities(DEFAULT_QUALITIES);
      }

      const currentQ = player.getPlaybackQuality?.();
      if (currentQ) {
        setActiveQuality(currentQ);
      }
    } catch {
      setQualities(DEFAULT_QUALITIES);
    }

    // 2. Fetch playback rate
    try {
      const rate = player.getPlaybackRate?.();
      if (typeof rate === 'number' && rate > 0) {
        setCurrentSpeed(rate);
      }
    } catch {}

    // 3. Fetch captions tracklist
    try {
      player.loadModule?.('captions');
      const tracks = player.getOption?.('captions', 'tracklist');
      if (Array.isArray(tracks) && tracks.length > 0) {
        setCaptionTracks(tracks);
        const currentTrack = player.getOption?.('captions', 'track');
        if (currentTrack && currentTrack.languageCode) {
          setActiveCaptionCode(currentTrack.languageCode);
        } else {
          setActiveCaptionCode('off');
        }
      } else {
        setCaptionTracks([]);
        setActiveCaptionCode('off');
      }
    } catch {
      setCaptionTracks([]);
      setActiveCaptionCode('off');
    }

    // 4. Fetch audio tracks (only if > 1 track)
    try {
      const aTracks = player.getAvailableAudioTracks?.();
      if (Array.isArray(aTracks) && aTracks.length > 1) {
        setAudioTracks(aTracks);
        const currentAudio = player.getAudioTrack?.();
        if (currentAudio?.id) {
          setActiveAudioTrackId(currentAudio.id);
        }
      } else {
        setAudioTracks([]);
      }
    } catch {
      setAudioTracks([]);
    }
  }, [isOpen, player]);

  // Clean up quality check timer on unmount
  useEffect(() => {
    return () => {
      if (qualityCheckTimerRef.current) {
        clearTimeout(qualityCheckTimerRef.current);
      }
    };
  }, []);

  // Quality Selection Handler with honest YouTube verification
  const handleSelectQuality = useCallback(
    (level: string) => {
      if (!player) return;
      setQualityWarning(null);

      try {
        player.setPlaybackQuality?.(level);
      } catch (err) {
        console.warn('setPlaybackQuality error:', err);
      }

      if (qualityCheckTimerRef.current) {
        clearTimeout(qualityCheckTimerRef.current);
      }

      // Check shortly after whether YouTube honored the requested level
      qualityCheckTimerRef.current = setTimeout(() => {
        try {
          const verified = player.getPlaybackQuality?.();
          if (verified) {
            setActiveQuality(verified);
            if (level !== 'auto' && verified !== level) {
              setQualityWarning('قد لا يستجيب يوتيوب لهذا الطلب');
            } else {
              setQualityWarning(null);
            }
          } else {
            setActiveQuality(level);
          }
        } catch {
          setActiveQuality(level);
        }
      }, 750);
    },
    [player]
  );

  // Playback Rate Selection Handler
  const handleSelectSpeed = useCallback(
    (rate: number) => {
      if (!player) return;
      try {
        player.setPlaybackRate?.(rate);
        setCurrentSpeed(rate);
      } catch (err) {
        console.warn('setPlaybackRate error:', err);
      }
    },
    [player]
  );

  // Captions Track Selection Handler
  const handleSelectCaption = useCallback(
    (trackCode: string) => {
      if (!player) return;
      try {
        if (trackCode === 'off') {
          player.setOption?.('captions', 'track', {});
          player.unloadModule?.('captions');
          setActiveCaptionCode('off');
        } else {
          const selected = captionTracks.find(
            (t) => t.languageCode === trackCode || t.id === trackCode
          );
          if (selected) {
            player.loadModule?.('captions');
            player.setOption?.('captions', 'track', selected);
            setActiveCaptionCode(trackCode);
          }
        }
      } catch (err) {
        console.warn('captions toggle error:', err);
      }
    },
    [player, captionTracks]
  );

  // Audio Track Selection Handler
  const handleSelectAudioTrack = useCallback(
    (trackId: string) => {
      if (!player) return;
      try {
        player.setAudioTrack?.(trackId);
        setActiveAudioTrackId(trackId);
      } catch (err) {
        console.warn('setAudioTrack error:', err);
      }
    },
    [player]
  );

  // Backdrop dismiss pattern: target === currentTarget dismisses the sheet
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="player-settings-backdrop"
      data-surface="player"
      onClick={handleBackdropClick}
      className="fixed inset-x-0 bottom-0 h-1/2 z-40 flex flex-col justify-end bg-yt-bg/70 backdrop-blur-[2px] transition-opacity duration-200 select-none animate-in fade-in"
      aria-label="خلفية إعدادات التشغيل"
    >
      {/* Slide-Up Bottom Sheet Panel (covers lower half of screen) */}
      <div
        id="player-settings-sheet"
        dir="rtl"
        className="w-full h-full bg-yt-surface border-t border-yt-border rounded-t-2xl shadow-2xl flex flex-col overflow-hidden text-yt-text transition-transform duration-250 ease-out animate-in slide-in-from-bottom-full"
      >
        {/* Top Header & Drag handle */}
        <div className="pt-2.5 pb-2 px-5 border-b border-yt-border shrink-0 bg-yt-surface/90">
          <div className="w-10 h-1 bg-yt-border rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-yt-brand-soft flex items-center justify-center text-yt-brand shrink-0">
                <Sliders className="w-4 h-4 text-yt-brand" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-yt-text leading-tight">
                  خيارات المشغل والتحكم
                </h3>
                <p className="text-[11px] text-yt-text-muted font-medium">
                  إعدادات العرض الآمن للطفل
                </p>
              </div>
            </div>
            <button
              type="button"
              id="player-settings-close-btn"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition active:scale-95 cursor-pointer"
              aria-label="إغلاق الإعدادات"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sheet Contents: Scrollable top-to-bottom sections */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-6">
          {/* Section 1: الجودة (Quality) */}
          <section id="settings-section-quality" className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-yt-text-muted flex items-center gap-1.5">
                <span>الجودة (Quality)</span>
              </span>
              {qualityWarning && (
                <span className="text-[11px] text-yt-brand flex items-center gap-1 bg-yt-brand-soft px-2 py-0.5 rounded-md border border-yt-brand/20">
                  <AlertCircle className="w-3 h-3 text-yt-brand shrink-0" />
                  <span>{qualityWarning}</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {qualities.map((level) => {
                const isSelected = activeQuality === level;
                const label = QUALITY_LABELS[level] || level;
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => handleSelectQuality(level)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs font-semibold transition active:scale-95 cursor-pointer ${
                      isSelected
                        ? 'bg-yt-brand-soft text-yt-brand border-yt-brand ring-1 ring-yt-brand/30'
                        : 'bg-yt-surface-muted/80 hover:bg-yt-surface-muted text-yt-text-muted border-yt-border'
                    }`}
                  >
                    <span className="truncate">{label}</span>
                    {isSelected && <Check className="w-4 h-4 text-yt-brand shrink-0 mr-1" />}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 2: سرعة التشغيل (Playback Speed) */}
          <section id="settings-section-speed" className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-yt-text-muted">
              <Gauge className="w-3.5 h-3.5 text-yt-brand" />
              <span>سرعة التشغيل (Playback speed)</span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {SPEED_OPTIONS.map((opt) => {
                const isSelected = currentSpeed === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelectSpeed(opt.value)}
                    className={`flex items-center justify-center gap-1 px-2 py-2.5 rounded-xl border text-xs font-semibold transition active:scale-95 cursor-pointer ${
                      isSelected
                        ? 'bg-yt-brand-soft text-yt-brand border-yt-brand ring-1 ring-yt-brand/30'
                        : 'bg-yt-surface-muted/80 hover:bg-yt-surface-muted text-yt-text-muted border-yt-border'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-yt-brand shrink-0" />}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 3: الترجمة (Captions) */}
          <section id="settings-section-captions" className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-yt-text-muted">
              <Subtitles className="w-3.5 h-3.5 text-yt-brand" />
              <span>الترجمة (Captions)</span>
            </div>

            {captionTracks.length > 0 ? (
              <div className="flex flex-col gap-1.5 pt-1">
                {/* Off Option */}
                <button
                  type="button"
                  onClick={() => handleSelectCaption('off')}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition active:scale-95 cursor-pointer ${
                    activeCaptionCode === 'off'
                      ? 'bg-yt-brand-soft text-yt-brand border-yt-brand ring-1 ring-yt-brand/30'
                      : 'bg-yt-surface-muted/80 hover:bg-yt-surface-muted text-yt-text-muted border-yt-border'
                  }`}
                >
                  <span>إيقاف الترجمة</span>
                  {activeCaptionCode === 'off' && (
                    <Check className="w-4 h-4 text-yt-brand shrink-0" />
                  )}
                </button>

                {/* Available tracks */}
                {captionTracks.map((track, idx) => {
                  const code = track.languageCode || track.id || String(idx);
                  const name =
                    track.displayName || track.languageName || track.name || code;
                  const isSelected = activeCaptionCode === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => handleSelectCaption(code)}
                      className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition active:scale-95 cursor-pointer ${
                        isSelected
                          ? 'bg-yt-brand-soft text-yt-brand border-yt-brand ring-1 ring-yt-brand/30'
                          : 'bg-yt-surface-muted/80 hover:bg-yt-surface-muted text-yt-text-muted border-yt-border'
                      }`}
                    >
                      <span className="truncate">{name}</span>
                      {isSelected && <Check className="w-4 h-4 text-yt-brand shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="px-3.5 py-3 rounded-xl bg-yt-surface/60 border border-yt-border text-xs text-yt-text-muted text-right">
                لا توجد ترجمة متاحة لهذا الفيديو
              </div>
            )}
          </section>

          {/* Section 4: مسار الصوت (Audio track) - only render if > 1 track */}
          {audioTracks.length > 1 && (
            <section id="settings-section-audio" className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-yt-text-muted">
                <Volume2 className="w-3.5 h-3.5 text-yt-brand" />
                <span>مسار الصوت (Audio track)</span>
              </div>

              <div className="flex flex-col gap-1.5 pt-1">
                {audioTracks.map((aTrack) => {
                  const isSelected = activeAudioTrackId === aTrack.id;
                  return (
                    <button
                      key={aTrack.id}
                      type="button"
                      onClick={() => handleSelectAudioTrack(aTrack.id)}
                      className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition active:scale-95 cursor-pointer ${
                        isSelected
                          ? 'bg-yt-brand-soft text-yt-brand border-yt-brand ring-1 ring-yt-brand/30'
                          : 'bg-yt-surface-muted/80 hover:bg-yt-surface-muted text-yt-text-muted border-yt-border'
                      }`}
                    >
                      <span className="truncate">{aTrack.displayName || aTrack.id}</span>
                      {isSelected && <Check className="w-4 h-4 text-yt-brand shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayerSettingsSheet;
