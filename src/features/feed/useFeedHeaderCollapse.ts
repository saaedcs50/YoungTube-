import { useState, useEffect, useRef } from 'react';

/**
 * Hook to manage scroll-collapse for the kids feed header.
 *
 * Rules:
 * - scroll down past ~48px → collapsed = true
 * - scroll up → collapsed = false
 * - near top (<= 48px) → always false
 * - Avoid setState every pixel by using a direction threshold (~8-12px)
 */
export function useFeedHeaderCollapse(): boolean {
  const [collapsed, setCollapsed] = useState(false);
  const lastScrollY = useRef(0);
  const collapsedRef = useRef(false);

  useEffect(() => {
    collapsedRef.current = collapsed;
  }, [collapsed]);

  useEffect(() => {
    const TOP_THRESHOLD = 48;
    const DIRECTION_THRESHOLD = 10; // 8-12px direction threshold

    const handleScroll = () => {
      const currentScrollY = Math.max(0, window.scrollY);
      const diff = currentScrollY - lastScrollY.current;

      // 1. Near top → always false
      if (currentScrollY <= TOP_THRESHOLD) {
        if (collapsedRef.current) {
          setCollapsed(false);
          collapsedRef.current = false;
        }
        lastScrollY.current = currentScrollY;
        return;
      }

      // 2. Below direction threshold → ignore micro-movements
      if (Math.abs(diff) < DIRECTION_THRESHOLD) {
        return;
      }

      // 3. Scroll down past threshold → collapsed true
      if (diff > 0 && !collapsedRef.current) {
        setCollapsed(true);
        collapsedRef.current = true;
      }
      // 4. Scroll up past threshold → collapsed false
      else if (diff < 0 && collapsedRef.current) {
        setCollapsed(false);
        collapsedRef.current = false;
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return collapsed;
}

export default useFeedHeaderCollapse;
