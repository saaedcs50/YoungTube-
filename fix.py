import re

with open('src/components/VideoPlayer.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

pattern = r'\{/\* Precision Seek Bar \*/\}.*?\{/\* 5\. Bottom Sheet Options Panel \*/\}'
replacement = '''{/* Precision Seek Bar */}
            {(() => {
              const currentProgressPct =
                activeDuration > 0
                  ? Math.min(
                      100,
                      Math.max(
                        0,
                        ((seekTimePreview ?? activeCurrentTime) / activeDuration) * 100
                      )
                    )
                  : 0;
              return (
                <div
                  ref={progressTrackRef}
                  className="relative w-full h-10 flex items-center cursor-pointer touch-none group"
                  onPointerDown={handleSeekBarPointerDown}
                  onPointerMove={handleSeekBarPointerMove}
                  onPointerUp={handleSeekBarPointerUp}
                >
                  {/* Background Track */}
                  <div className="w-full h-1 group-hover:h-2 bg-white/30 rounded-full overflow-hidden transition-all relative">
                    <div
                      className="progress-fill h-full bg-red-600 rounded-full transition-all duration-75"
                      style={{ width: `${currentProgressPct}%` }}
                    />
                  </div>

                  {/* Scrubber Knob */}
                  <div
                    className="progress-handle absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 group-hover:w-4 group-hover:h-4 bg-red-600 rounded-full shadow ring-2 ring-white transition-all scale-90 group-hover:scale-100"
                    style={{ left: `${currentProgressPct}%` }}
                  />
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 5. Bottom Sheet Options Panel */}'''

new_text = re.sub(pattern, replacement, text, flags=re.DOTALL)
with open('src/components/VideoPlayer.tsx', 'w', encoding='utf-8') as f:
    f.write(new_text)

print('Updated VideoPlayer.tsx successfully!')
