import React from 'react';
import { Play } from 'lucide-react';

export const YoungTubeWordmark: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div
    className={`inline-flex items-center select-none font-black tracking-[-0.045em] leading-none ${compact ? 'text-[18px]' : 'text-[22px] sm:text-[24px]'}`}
    aria-label="YoungTube"
  >
    <span className="text-yt-text">Young</span>
    <span
      className={`mx-0.5 inline-flex items-center justify-center rounded-[4px] bg-[#FF0000] text-white shadow-sm ${compact ? 'h-4.5 w-6' : 'h-5 w-7 sm:h-5.5 sm:w-7.5'}`}
      aria-hidden="true"
    >
      <Play className={`${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} fill-white stroke-[3] ml-0.5`} />
    </span>
    <span className="text-yt-text">Tube</span>
  </div>
);

export default YoungTubeWordmark;
