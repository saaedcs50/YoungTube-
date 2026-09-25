import { useEffect, useRef, useState } from 'react';

// Tuning constants for YouTube-style direction + hysteresis
export const TOP_EXPAND = 32;       // scrollY <= this threshold always forces expanded state
export const COLLAPSE_AFTER = 80;   // Minimum scrollY needed before downward collapse can trigger
export const COLLAPSE_DELTA = 32;   // Accumulated downward scroll delta required to collapse
export const EXPAND_DELTA = 56;     // Accumulated upward scroll delta required to expand (hysteresis prevents flicker)
export const MIN_STEP = 4;          // Ignore micro-jitter / tiny scroll increments

export interface UseFeedHeaderCollapseOptions {
  topExpand?: number;
  collapseAfter?: number;
  collapseDelta?: number;
  expandDelta?: number;
  minStep?: number;
}

/**
 * Hook providing YouTube-style direction + hysteresis scroll logic for the kids feed header.
 * 
 * Returns boolean `collapsed`:
 * - true  = compact single bar
 * - false = full header
 * 
 * Rules:
 * 1) scrollY <= TOP_EXPAND (32) -> always collapsed = false
 * 2) Scroll DOWN: only set collapsed true if scrollY >= COLLAPSE_AFTER (80)
 *    and accumulated downward delta >= COLLAPSE_DELTA (32)
 * 3) Scroll UP: only set collapsed false if accumulated upward delta >= EXPAND_DELTA (56)
 *    (EXPAND_DELTA > COLLAPSE_DELTA = hysteresis, prevents flicker)
 * 4) Ignore |diff| < MIN_STEP (4)
 * 5) Passive window scroll listener throttled with requestAnimationFrame (at most once per frame)
 * 6) Uses refs for lastScrollY, accumulated delta, and collapsedRef to eliminate redundant setStates
 */
export function useFeedHeaderCollapse(options?: UseFeedHeaderCollapseOptions): boolean {
  const topExpand = options?.topExpand ?? TOP_EXPAND;
  const collapseAfter = options?.collapseAfter ?? COLLAPSE_AFTER;
  const collapseDelta = options?.collapseDelta ?? COLLAPSE_DELTA;
  const expandDelta = options?.expandDelta ?? EXPAND_DELTA;
  const minStep = options?.minStep ?? MIN_STEP;

  const [collapsed, setCollapsed] = useState<boolean>(false);

  // Refs for tracking state and eliminating redundant setStates
  const collapsedRef = useRef<boolean>(false);
  const lastScrollYRef = useRef<number>(0);
  const accumulatedDeltaRef = useRef<number>(0); // positive: downward, negative: upward
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    // Initialize scroll state on mount
    const initialY = typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0;
    lastScrollYRef.current = initialY;
    if (initialY <= topExpand && collapsedRef.current) {
      collapsedRef.current = false;
      setCollapsed(false);
    }

    const updateScroll = () => {
      const scrollY = Math.max(0, window.scrollY || window.pageYOffset || 0);
      const diff = scrollY - lastScrollYRef.current;

      // Rule 1: Near top -> always expand
      if (scrollY <= topExpand) {
        accumulatedDeltaRef.current = 0;
        lastScrollYRef.current = scrollY;
        if (collapsedRef.current) {
          collapsedRef.current = false;
          setCollapsed(false);
        }
        return;
      }

      // Rule 4: Ignore micro-steps
      if (Math.abs(diff) < minStep) {
        lastScrollYRef.current = scrollY;
        return;
      }

      // Direction tracking and accumulation
      if (diff > 0) {
        // Scrolling DOWN
        if (accumulatedDeltaRef.current < 0) {
          accumulatedDeltaRef.current = diff;
        } else {
          accumulatedDeltaRef.current += diff;
        }

        // Rule 2: Scroll DOWN condition
        if (
          !collapsedRef.current &&
          scrollY >= collapseAfter &&
          accumulatedDeltaRef.current >= collapseDelta
        ) {
          collapsedRef.current = true;
          setCollapsed(true);
        }
      } else if (diff < 0) {
        // Scrolling UP
        const upDelta = -diff;
        if (accumulatedDeltaRef.current > 0) {
          accumulatedDeltaRef.current = -upDelta;
        } else {
          accumulatedDeltaRef.current -= upDelta;
        }

        // Rule 3: Scroll UP condition (hysteresis)
        if (
          collapsedRef.current &&
          Math.abs(accumulatedDeltaRef.current) >= expandDelta
        ) {
          collapsedRef.current = false;
          setCollapsed(false);
        }
      }

      lastScrollYRef.current = scrollY;
    };

    const handleScroll = () => {
      if (rafIdRef.current !== null) return;
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        updateScroll();
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [topExpand, collapseAfter, collapseDelta, expandDelta, minStep]);

  return collapsed;
}

export default useFeedHeaderCollapse;
