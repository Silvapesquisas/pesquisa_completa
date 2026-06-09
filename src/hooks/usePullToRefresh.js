import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Pull-to-refresh hook for mobile.
 * @param {Function} onRefresh - async function to call on refresh
 * @param {Object} options
 * @param {number} options.threshold - px to pull before triggering (default 64)
 * @param {HTMLElement|null} options.scrollContainer - element to attach to (default: window)
 */
export function usePullToRefresh(onRefresh, { threshold = 64, scrollContainer = null } = {}) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(null);
  const isPullingRef = useRef(false);

  const getScrollTop = useCallback(() => {
    if (scrollContainer) return scrollContainer.scrollTop;
    return window.scrollY || document.documentElement.scrollTop;
  }, [scrollContainer]);

  useEffect(() => {
    const el = scrollContainer || window;

    const onTouchStart = (e) => {
      if (getScrollTop() > 0) return;
      startYRef.current = e.touches[0].clientY;
      isPullingRef.current = true;
    };

    const onTouchMove = (e) => {
      if (!isPullingRef.current || startYRef.current === null) return;
      if (getScrollTop() > 0) {
        isPullingRef.current = false;
        setPullDistance(0);
        return;
      }
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta < 0) {
        setPullDistance(0);
        return;
      }
      // Rubber-band effect
      const distance = Math.min(delta * 0.5, threshold * 1.5);
      setPullDistance(distance);
    };

    const onTouchEnd = async () => {
      if (!isPullingRef.current) return;
      isPullingRef.current = false;
      startYRef.current = null;
      if (pullDistance >= threshold && !isRefreshing) {
        setIsRefreshing(true);
        setPullDistance(0);
        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
        }
      } else {
        setPullDistance(0);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [onRefresh, threshold, scrollContainer, pullDistance, isRefreshing, getScrollTop]);

  return { pullDistance, isRefreshing };
}