'use client';

import { Minus, Plus } from 'lucide-react';

interface ZoomControlsProps {
  zoomPercent: number;
  zoomIn: () => void;
  zoomOut: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
}

export function ZoomControls({ zoomPercent, zoomIn, zoomOut, canZoomIn, canZoomOut }: ZoomControlsProps) {
  return (
    <div className="flex-shrink-0 flex items-center justify-center gap-2 py-2 border-t border-border bg-card/50">
      <button
        onClick={zoomOut}
        disabled={!canZoomOut}
        className="w-7 h-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none transition-colors"
        title="Zoom out"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className="text-xs text-muted-foreground w-10 text-center tabular-nums">{zoomPercent}%</span>
      <button
        onClick={zoomIn}
        disabled={!canZoomIn}
        className="w-7 h-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none transition-colors"
        title="Zoom in"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
