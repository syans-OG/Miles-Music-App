import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, X } from 'lucide-react';
import { usePlayerStore } from '../stores/usePlayerStore';

export const WindowControlsBar: React.FC = () => {
  const { mode, isTopControlOpen } = usePlayerStore(useShallow((state) => ({
    mode: state.mode,
    isTopControlOpen: state.isTopControlOpen,
  })));

  // Do not show floating controls in Mode 1, Mode 2, or Mode 3
  if (mode === 'control-bar' || mode === 'vinyl-widget' || mode === 'micro-bubble') return null;

  const handleMinimize = async () => {
    try {
      await invoke('minimize_window');
    } catch {
      try {
        await getCurrentWindow().minimize();
      } catch {
        // Browser fallback
      }
    }
  };

  const handleClose = async () => {
    try {
      await invoke('hide_window');
    } catch {
      try {
        await getCurrentWindow().hide();
      } catch {
        // Browser fallback
      }
    }
  };

  // Only display floating controls when isTopControlOpen is true
  if (!isTopControlOpen) return null;

  return (
    <div className="absolute top-0 right-4 z-50 flex items-center gap-1 bg-slate-950/95 backdrop-blur-2xl border border-amber-400/40 shadow-2xl rounded-2xl p-1.5 text-xs animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-auto">
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
