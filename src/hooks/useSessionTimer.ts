import { useState, useEffect, useRef, useCallback } from 'react';
import db from '../db';

export function getTodayLocalDateStr(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isTimeInWindow(start: string, end: string, d: Date = new Date()): boolean {
  if (!start || !end) return true;
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const nowTime = `${h}:${m}`;

  if (start <= end) {
    return nowTime >= start && nowTime <= end;
  } else {
    // Overnight window (e.g. 20:00 to 06:00)
    return nowTime >= start || nowTime <= end;
  }
}

export interface SessionTimerState {
  secondsUsedToday: number;
  sessionLimitMinutes: number;
  isLimitReached: boolean;
  isWithinScheduleWindow: boolean;
  scheduleWindow: { start: string; end: string };
  resetTodayUsage: () => Promise<void>;
  simulateLimitReached: () => Promise<void>;
  refreshSettings: () => Promise<void>;
}

export function useSessionTimer(): SessionTimerState {
  const [secondsUsedToday, setSecondsUsedToday] = useState<number>(0);
  const [sessionLimitMinutes, setSessionLimitMinutes] = useState<number>(60);
  const [scheduleWindow, setScheduleWindow] = useState<{ start: string; end: string }>({
    start: '00:00',
    end: '23:59',
  });
  const [isWithinScheduleWindow, setIsWithinScheduleWindow] = useState<boolean>(true);

  const secondsRef = useRef<number>(0);
  const lastWrittenSecondsRef = useRef<number>(0);
  const todayDateRef = useRef<string>(getTodayLocalDateStr());
  const isInitializedRef = useRef<boolean>(false);

  // Load settings (limit + schedule window)
  const refreshSettings = useCallback(async () => {
    try {
      const main = await db.settings.get('main');
      if (main) {
        if (typeof main.sessionLimitMinutes === 'number') {
          setSessionLimitMinutes(main.sessionLimitMinutes);
        }
        if (main.scheduleWindow?.start && main.scheduleWindow?.end) {
          setScheduleWindow(main.scheduleWindow);
        }
      }
    } catch (err) {
      console.error('Error reading settings in useSessionTimer:', err);
    }
  }, []);

  // Initialize today's usage record
  useEffect(() => {
    let isCancelled = false;

    async function initUsage() {
      const today = getTodayLocalDateStr();
      todayDateRef.current = today;

      await refreshSettings();

      try {
        const usageRecord = await db.usage.get(today);
        if (isCancelled) return;

        if (usageRecord && typeof usageRecord.secondsUsedToday === 'number') {
          // Use stored cumulative value as starting point (do NOT reset to 0)
          secondsRef.current = usageRecord.secondsUsedToday;
          lastWrittenSecondsRef.current = usageRecord.secondsUsedToday;
          setSecondsUsedToday(usageRecord.secondsUsedToday);
        } else {
          // Initialize with 0
          secondsRef.current = 0;
          lastWrittenSecondsRef.current = 0;
          setSecondsUsedToday(0);
          await db.usage.put({ date: today, secondsUsedToday: 0 });
        }
      } catch (err) {
        console.error('Failed to get/init today usage from db.usage:', err);
      } finally {
        isInitializedRef.current = true;
      }
    }

    initUsage();

    return () => {
      isCancelled = true;
    };
  }, [refreshSettings]);

  // Flush current seconds to DB
  const flushToDb = useCallback(async (seconds: number) => {
    const today = todayDateRef.current;
    try {
      await db.usage.put({ date: today, secondsUsedToday: seconds });
      lastWrittenSecondsRef.current = seconds;
    } catch (err) {
      console.error('Failed to flush usage to db.usage:', err);
    }
  }, []);

  // Timer interval: tick every 1 second when in foreground
  useEffect(() => {
    // Check schedule window initially & update
    const checkSchedule = () => {
      setIsWithinScheduleWindow(isTimeInWindow(scheduleWindow.start, scheduleWindow.end));
    };
    checkSchedule();

    const interval = setInterval(() => {
      // 1. Pause counting when tab/app is hidden
      if (document.visibilityState !== 'visible') {
        return;
      }

      // Check schedule window every second
      checkSchedule();

      // Check if day rolled over
      const currentToday = getTodayLocalDateStr();
      if (currentToday !== todayDateRef.current) {
        // Day changed mid-session
        todayDateRef.current = currentToday;
        secondsRef.current = 0;
        lastWrittenSecondsRef.current = 0;
        setSecondsUsedToday(0);
        db.usage.put({ date: currentToday, secondsUsedToday: 0 });
        return;
      }

      // Increment seconds by 1
      secondsRef.current += 1;
      const currentSeconds = secondsRef.current;
      setSecondsUsedToday(currentSeconds);

      // Debounce DB write: flush once every 5 seconds
      if (currentSeconds - lastWrittenSecondsRef.current >= 5) {
        flushToDb(currentSeconds);
      }
    }, 1000);

    // Save immediately on visibility change or page unload
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushToDb(secondsRef.current);
      } else {
        checkSchedule();
      }
    };

    const handleBeforeUnload = () => {
      flushToDb(secondsRef.current);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Flush any pending seconds on unmount
      flushToDb(secondsRef.current);
    };
  }, [scheduleWindow, flushToDb]);

  // Reset today's usage (for testing purposes)
  const resetTodayUsage = useCallback(async () => {
    const today = getTodayLocalDateStr();
    todayDateRef.current = today;
    secondsRef.current = 0;
    lastWrittenSecondsRef.current = 0;
    setSecondsUsedToday(0);
    await db.usage.put({ date: today, secondsUsedToday: 0 });
  }, []);

  // Simulate limit reached (for testing purposes)
  const simulateLimitReached = useCallback(async () => {
    const target = sessionLimitMinutes * 60;
    const today = getTodayLocalDateStr();
    todayDateRef.current = today;
    secondsRef.current = target;
    lastWrittenSecondsRef.current = target;
    setSecondsUsedToday(target);
    await db.usage.put({ date: today, secondsUsedToday: target });
  }, [sessionLimitMinutes]);

  const isLimitReached = secondsUsedToday >= sessionLimitMinutes * 60;

  return {
    secondsUsedToday,
    sessionLimitMinutes,
    isLimitReached,
    isWithinScheduleWindow,
    scheduleWindow,
    resetTodayUsage,
    simulateLimitReached,
    refreshSettings,
  };
}
