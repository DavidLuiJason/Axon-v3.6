import { ScreenId, ScrollPositionMap } from '../types';

let liveScrollPositions: ScrollPositionMap = {};
let isTrackerInitialized = false;

/**
 * Captures the current scroll positions of all scrollable containers on screen.
 */
export function captureScreenScroll(screen: ScreenId): ScrollPositionMap {
  const scrollMap: ScrollPositionMap = {};

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return scrollMap;
  }

  // Window scroll
  scrollMap['window'] = {
    top: window.scrollY || document.documentElement.scrollTop || 0,
    left: window.scrollX || document.documentElement.scrollLeft || 0,
  };

  // Internal scroll containers
  const scrollableElements = document.querySelectorAll(
    '[data-scroll-container], .overflow-y-auto, .overflow-y-scroll, main, [role="main"]'
  );

  scrollableElements.forEach((el, index) => {
    const htmlEl = el as HTMLElement;
    if (htmlEl.scrollTop > 0 || htmlEl.scrollLeft > 0) {
      const key = htmlEl.id ? `#${htmlEl.id}` : `[data-scroll-index="${index}"]`;
      scrollMap[key] = {
        top: htmlEl.scrollTop,
        left: htmlEl.scrollLeft,
      };
    }
  });

  liveScrollPositions = { ...liveScrollPositions, ...scrollMap };
  return scrollMap;
}

/**
 * Restores saved scroll positions for the active screen.
 */
export function restoreScreenScroll(positions?: ScrollPositionMap, screen?: ScreenId): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const targets = positions || liveScrollPositions;
  if (!targets) return;

  requestAnimationFrame(() => {
    // Restore window scroll
    if (targets['window']) {
      window.scrollTo({
        top: targets['window'].top,
        left: targets['window'].left,
        behavior: 'instant' as ScrollBehavior,
      });
    }

    // Restore element scroll
    Object.entries(targets).forEach(([selector, pos]) => {
      if (selector === 'window') return;
      try {
        const el = document.querySelector(selector) as HTMLElement;
        if (el) {
          el.scrollTop = pos.top;
          el.scrollLeft = pos.left;
        }
      } catch {
        // Ignore invalid selectors
      }
    });
  });
}

/**
 * Clears the in-memory live scroll positions cache.
 */
export function clearLiveScrollPositions(): void {
  liveScrollPositions = {};
}

/**
 * Sets up global scroll tracking for persistent back/forward navigation.
 */
export function initNavigationScrollTracker(): () => void {
  if (typeof window === 'undefined' || isTrackerInitialized) {
    return () => {};
  }

  isTrackerInitialized = true;

  const handleScroll = () => {
    // Passive tracking
  };

  window.addEventListener('scroll', handleScroll, { passive: true });

  return () => {
    window.removeEventListener('scroll', handleScroll);
    isTrackerInitialized = false;
  };
}
