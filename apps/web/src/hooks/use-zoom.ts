'use client';

import { useEffect, useState } from 'react';

// Percentage-based zoom levels, applied via CSS transform: scale() on
// whatever content wrapper a page passes it to. Shared across every
// dashboard rather than each one reinventing its own zoom state -
// Shop Floor Dashboard keeps its own bespoke per-column width zoom
// (built earlier, works well for a kanban-style board specifically),
// this is for everything else: Supervisor Dashboard, Director
// Dashboard, Manager Dashboard, Planner, Purchasing, Designing.
const ZOOM_LEVELS = [70, 80, 90, 100, 110, 125];
const DEFAULT_INDEX = ZOOM_LEVELS.indexOf(100);

export function useZoom(storageKey: string) {
  const [levelIndex, setLevelIndex] = useState(DEFAULT_INDEX);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const idx = ZOOM_LEVELS.indexOf(Number(saved));
      if (idx >= 0) setLevelIndex(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const zoomIn = () => setLevelIndex((i) => {
    const next = Math.min(ZOOM_LEVELS.length - 1, i + 1);
    localStorage.setItem(storageKey, String(ZOOM_LEVELS[next]));
    return next;
  });
  const zoomOut = () => setLevelIndex((i) => {
    const next = Math.max(0, i - 1);
    localStorage.setItem(storageKey, String(ZOOM_LEVELS[next]));
    return next;
  });

  const zoomPercent = ZOOM_LEVELS[levelIndex];

  // Applied to a content wrapper: transform scales it visually, and the
  // width compensation (100 / scale) keeps it filling the same visual
  // space as before instead of leaving a blank gap when scaled down -
  // the element's layout box doesn't shrink just because its rendered
  // appearance does, so without this the content would visually shrink
  // into the top-left corner with empty space around it.
  const zoomStyle: React.CSSProperties = zoomPercent === 100 ? {} : {
    transform: `scale(${zoomPercent / 100})`,
    transformOrigin: 'top left',
    width: `${(100 / zoomPercent) * 100}%`,
  };

  return {
    zoomPercent,
    zoomIn,
    zoomOut,
    canZoomIn: levelIndex < ZOOM_LEVELS.length - 1,
    canZoomOut: levelIndex > 0,
    zoomStyle,
  };
}
