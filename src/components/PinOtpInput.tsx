import React, { useRef, useEffect } from 'react';

interface PinOtpInputProps {
  idPrefix: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  theme?: 'amber' | 'sky';
  hasError?: boolean;
  onComplete?: (completedPin: string) => void;
}

export default function PinOtpInput({
  idPrefix,
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  theme = 'amber',
  hasError = false,
  onComplete,
}: PinOtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Array of 6 characters based on the string value
  const digits = Array.from({ length: 6 }, (_, index) => value[index] || '');

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  const focusInput = (index: number) => {
    if (index >= 0 && index < 6) {
      inputRefs.current[index]?.focus();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const rawVal = e.target.value.replace(/\D/g, '');
    if (!rawVal) {
      // Cleared
      const newDigits = [...digits];
      newDigits[index] = '';
      const newVal = newDigits.join('').slice(0, 6);
      onChange(newVal);
      return;
    }

    // If multiple digits were typed/inputted
    if (rawVal.length > 1) {
      const chars = rawVal.split('');
      const newDigits = [...digits];
      let lastIndex = index;
      for (let i = 0; i < chars.length && index + i < 6; i++) {
        newDigits[index + i] = chars[i];
        lastIndex = index + i;
      }
      const newVal = newDigits.join('').slice(0, 6);
      onChange(newVal);
      focusInput(Math.min(lastIndex + 1, 5));
      if (newVal.length === 6 && onComplete) {
        onComplete(newVal);
      }
      return;
    }

    // Single digit input
    const singleDigit = rawVal[0];
    const newDigits = [...digits];
    newDigits[index] = singleDigit;
    const newVal = newDigits.join('').slice(0, 6);
    onChange(newVal);

    if (index < 5) {
      focusInput(index + 1);
    }

    if (newVal.length === 6 && onComplete) {
      onComplete(newVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Current box is empty, go to previous and clear it
        e.preventDefault();
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        onChange(newDigits.join('').slice(0, 6));
        focusInput(index - 1);
      } else if (digits[index]) {
        // Current box is filled, clear it
        e.preventDefault();
        const newDigits = [...digits];
        newDigits[index] = '';
        onChange(newDigits.join('').slice(0, 6));
      }
    } else if (e.key === 'ArrowLeft') {
      if (index > 0) {
        e.preventDefault();
        focusInput(index - 1);
      }
    } else if (e.key === 'ArrowRight') {
      if (index < 5) {
        e.preventDefault();
        focusInput(index + 1);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasteData) return;

    onChange(pasteData);
    const targetFocusIndex = Math.min(pasteData.length, 5);
    focusInput(targetFocusIndex);

    if (pasteData.length === 6 && onComplete) {
      onComplete(pasteData);
    }
  };

  const activeRing =
    theme === 'sky'
      ? 'focus:ring-2 focus:ring-yt-info/30 focus:border-yt-info'
      : 'focus:ring-2 focus:ring-yt-brand/30 focus:border-yt-brand';

  const filledBg =
    theme === 'sky'
      ? 'border-yt-info bg-yt-info/10 text-yt-text shadow-2xs'
      : 'border-yt-brand bg-yt-brand-soft text-yt-text shadow-2xs';

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-2.5 dir-ltr" dir="ltr">
      {Array.from({ length: 6 }).map((_, index) => {
        const digit = digits[index] || '';
        const isFilled = Boolean(digit);

        return (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            id={`${idPrefix}-otp-${index}`}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={digit}
            disabled={disabled}
            onChange={(e) => handleInputChange(e, index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            aria-label={`رقم ${index + 1} من 6`}
            className={`w-10 h-12 sm:w-12 sm:h-13 text-center text-xl font-bold font-mono rounded-xl border transition-all outline-hidden cursor-text disabled:opacity-50 ${
              hasError
                ? 'border-yt-danger bg-rose-50/60 text-yt-danger focus:ring-2 focus:ring-yt-danger/30 focus:border-yt-danger'
                : isFilled
                ? filledBg
                : `border-yt-border bg-yt-surface-muted/60 hover:bg-yt-surface focus:bg-yt-surface text-yt-text ${activeRing}`
            }`}
          />
        );
      })}
    </div>
  );
}
