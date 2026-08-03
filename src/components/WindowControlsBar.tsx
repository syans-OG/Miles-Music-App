import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Minus,
  X,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDownRight,
  Move
} from 'lucide-react';
import { usePlayerStore } from '../stores/usePlayerStore';
import { DockPosition } from '../types/player';

export const WindowControlsBar: React.FC = () => {
  const { mode, dockPosition, setDockPosition, isTopControlOpen, setTopControlOpen } = usePlayerStore(useShallow((state) => ({
    mode: state.mode,
    dockPosition: state.dockPosition,
    setDockPosition: state.setDockPosition,
    isTopControlOpen: state.isTopControlOpen,
    setTopControlOpen: state.setTopControlOpen,
  })));

  // Rule 3: Do not show floating controls in Mode 1 (inlined in ControlBar), Mode 2 (VinylWidget), or Mode 3 (Micro Bubble)
  if (mode === 'control-bar' || mode === 'vinyl-widget' || mode === 'micro-bubble') return null;


  const handleMinimize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch {
      // Browser fallback
    }
  };

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch {
      // Browser fallback
    }
  };

  const handleSelectPosition = (pos: DockPosition) => {
    setDockPosition(pos);
    setTopControlOpen(false);
  };

  // Only display floating controls when isTopControlOpen is true (toggled via Δ arrow button next to +)
  if (!isTopControlOpen) return null;

  return (
    /* Floating Bar Position: Directly ABOVE top right border of main widget card (as per user sketch) */
    <div className="absolute top-0 right-4 z-50 flex items-center gap-1 bg-slate-950/95 backdrop-blur-2xl border border-amber-400/40 shadow-2xl rounded-2xl p-1.5 text-xs animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-auto">
      {/* 5-Position Snap Preset Buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => handleSelectPosition('top-left')}
          title="Snap: Pojok Kiri Atas"
          className={`p-1.5 rounded-xl transition-all ${
            dockPosition === 'top-left'
              ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20 scale-105'
              : 'text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <ArrowUpLeft className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => handleSelectPosition('top-right')}
          title="Snap: Pojok Kanan Atas"
          className={`p-1.5 rounded-xl transition-all ${
            dockPosition === 'top-right'
              ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20 scale-105'
              : 'text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => handleSelectPosition('bottom-left')}
          title="Snap: Pojok Kiri Bawah"
          className={`p-1.5 rounded-xl transition-all ${
            dockPosition === 'bottom-left'
              ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20 scale-105'
              : 'text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <ArrowDownLeft className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => handleSelectPosition('bottom-right')}
          title="Snap: Pojok Kanan Bawah"
          className={`p-1.5 rounded-xl transition-all ${
            dockPosition === 'bottom-right'
              ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20 scale-105'
              : 'text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <ArrowDownRight className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => handleSelectPosition('free')}
          title="Posisi Bebas (Free Drag)"
          className={`p-1.5 rounded-xl transition-all ${
            dockPosition === 'free'
              ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20 scale-105'
              : 'text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <Move className="w-3.5 h-3.5" />
        </button>
      </div>

      <span className="w-[1px] h-4 bg-white/15 mx-1" />

      {/* Action Buttons: Minimize & Close */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleMinimize}
          title="Minimize Widget"
          className="p-1.5 rounded-xl text-slate-300 hover:text-amber-300 hover:bg-white/10 transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleClose}
          title="Close Application"
          className="p-1.5 rounded-xl text-slate-300 hover:text-rose-400 hover:bg-rose-500/20 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
