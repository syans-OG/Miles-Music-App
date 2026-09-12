import React from 'react';
import { Gamepad2, Palette, Paintbrush, Pin, Repeat2, Settings, Square, Volume2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useThemeStore, customAccentStyle, ThemeColorId, ThemeMode } from '../stores/useThemeStore';
import { ColorWheel } from './ColorWheel';
import { AppMode } from '../types/player';

const startupOptions: Array<{ value: 'last' | AppMode; label: string }> = [
  { value: 'last', label: 'Last Used' },
  { value: 'control-bar', label: 'Full' },
  { value: 'vinyl-widget', label: 'Widget' },
  { value: 'micro-bubble', label: 'Mini' },
];

const themeModeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

const themeColorOptions: Array<{ id: ThemeColorId; label: string; swatch: string }> = [
  { id: 'minimal', label: 'Minimal', swatch: 'bg-[#C6CFD9]' },
  { id: 'emerald', label: 'Emerald', swatch: 'bg-[#2ED49B]' },
  { id: 'sunset', label: 'Sunset', swatch: 'bg-[#F5B549]' },
  { id: 'custom', label: 'Custom', swatch: 'bg-[linear-gradient(90deg,#f43f5e,#f59e0b,#22c55e,#06b6d4,#8b5cf6)]' },
];



export const SettingsPanel: React.FC = () => {
  const {
    volume,
    setVolume,
    isMuted,
    isAlwaysOnTop,
    setAlwaysOnTop,
    startupMode,
    setStartupMode,
    queueEndBehavior,
    setQueueEndBehavior,
    enableDiscordRpc,
    setEnableDiscordRpc,
  } = usePlayerStore(useShallow((state) => ({
    volume: state.volume,
    setVolume: state.setVolume,
    isMuted: state.isMuted,
    isAlwaysOnTop: state.isAlwaysOnTop,
    setAlwaysOnTop: state.setAlwaysOnTop,
    startupMode: state.startupMode,
    setStartupMode: state.setStartupMode,
    queueEndBehavior: state.queueEndBehavior,
    setQueueEndBehavior: state.setQueueEndBehavior,
    enableDiscordRpc: state.enableDiscordRpc,
    setEnableDiscordRpc: state.setEnableDiscordRpc,
  })));

  const { mode, setMode, colorId, setColorId, custom, setCustom } = useThemeStore(useShallow((state) => ({
    mode: state.mode,
    setMode: state.setMode,
    colorId: state.colorId,
    setColorId: state.setColorId,
    custom: state.custom,
    setCustom: state.setCustom,
  })));

  const volumeLabel = isMuted ? 'MUTE' : `${Math.round(volume * 100)}%`;

  return (
    <section className="h-[317px] overflow-y-auto overscroll-contain pl-1 pr-3 animate-fade-in" aria-labelledby="settings-panel-title">
      <header className="flex h-[37px] items-center justify-between border-b border-th-line">
        <div className="flex min-w-0 items-center gap-2">
          <Settings className="h-3.5 w-3.5 flex-shrink-0 text-th-accent" strokeWidth={1.8} />
          <h3 id="settings-panel-title" className="flex-shrink-0 text-[12px] font-bold tracking-tight text-th-primary">Miles Settings</h3>
          <span className="truncate text-[8px] text-slate-500">Auto-saved</span>
        </div>
        <span className="pt-1 font-mono text-[8px] uppercase tracking-[0.14em] text-slate-600">7 preferences</span>
      </header>

      <div className="divide-y divide-th-line">
        <div className="flex h-[58px] items-center gap-3">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-th-soft text-th-accent">
            <Palette className="h-3.5 w-3.5" strokeWidth={1.8} />
          </div>
          <div className="w-[82px] flex-shrink-0">
            <p className="text-[10px] font-semibold text-th-primary">Mode</p>
            <p className="mt-0.5 text-[8px] text-slate-500">Dark / Light</p>
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-1 rounded-xl bg-th-soft p-1" role="group" aria-label="Theme mode">
            {themeModeOptions.map((option) => {
              const isActive = mode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMode(option.value)}
                  className={`rounded-lg px-1 py-1.5 text-[8px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-amber-300/50 active:scale-[0.97] ${isActive ? 'bg-th-pill-active text-th-pill-active-text shadow-sm' : 'text-slate-500 hover:bg-th-soft-strong hover:text-th-primary'}`}
                  aria-pressed={isActive}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex h-[58px] items-center gap-3">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-th-soft text-th-accent">
            <Paintbrush className="h-3.5 w-3.5" strokeWidth={1.8} />
          </div>
          <div className="w-[82px] flex-shrink-0">
            <p className="text-[10px] font-semibold text-th-primary">Color</p>
            <p className="mt-0.5 text-[8px] text-slate-500">Theme presets</p>
          </div>
          <div className="grid min-w-0 flex-1 gap-1 rounded-xl bg-th-soft p-1" style={{ gridTemplateColumns: `repeat(${themeColorOptions.length}, minmax(0, 1fr))` }} role="group" aria-label="Theme color presets">
            {themeColorOptions.map((option) => {
              const isActive = colorId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setColorId(option.id)}
                  aria-label={option.label}
                  title={option.label}
                  className={`flex items-center justify-center rounded-lg px-2 py-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-amber-300/50 active:scale-[0.97] ${isActive ? 'bg-th-pill-active shadow-sm' : 'hover:bg-th-soft-strong'}`}
                  aria-pressed={isActive}
                >
                  <span className={`h-4 w-4 rounded-full ${option.swatch} ${isActive ? 'ring-2 ring-th-accent' : 'opacity-60 transition-opacity hover:opacity-90'}`} />
                </button>
              );
            })}
          </div>
        </div>

        {colorId === 'custom' && (
          <div className="flex items-center gap-4 py-3">
            <ColorWheel
              hue={custom.hue}
              sat={custom.sat}
              onChange={(hue, sat) => setCustom({ hue, sat })}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className="h-6 w-6 flex-shrink-0 rounded-full shadow-sm ring-1 ring-th-border"
                  style={{ backgroundColor: customAccentStyle(mode, custom) }}
                />
                <div className="min-w-0">
                  <p className="truncate font-mono text-[12px] font-bold text-th-primary">
                    {custom.hue}&deg; &middot; {custom.sat}%
                  </p>
                  <p className="mt-0.5 truncate text-[8px] text-slate-500">accent color</p>
                </div>
              </div>
              <p className="mt-3 text-[9px] leading-relaxed text-slate-500">
                Drag on the wheel — position sets hue &amp; saturation. Brightness follows the
                Dark/Light mode automatically.
              </p>
            </div>
          </div>
        )}
        <div className="flex h-[48px] items-center gap-3">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-th-soft text-th-accent">
            <Volume2 className="h-3.5 w-3.5" strokeWidth={1.8} />
          </div>
          <div className="w-[82px] flex-shrink-0">
            <p className="text-[10px] font-semibold text-th-primary">Volume</p>
            <p className="mt-0.5 text-[8px] text-slate-500">Saved level</p>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="Saved volume"
            className="h-1 min-w-0 flex-1 cursor-pointer accent-amber-400 focus-visible:ring-2 focus-visible:ring-amber-300/50"
          />
          <span className="w-9 text-right font-mono text-[9px] font-bold text-th-accent">{volumeLabel}</span>
        </div>

        <div className="flex h-[48px] items-center gap-3">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-th-soft text-th-accent">
            <Pin className="h-3.5 w-3.5" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-th-primary">Always on top</p>
            <p className="mt-0.5 text-[8px] text-slate-500">Keep Miles above other windows</p>
          </div>
          <span className={`font-mono text-[8px] font-bold uppercase ${isAlwaysOnTop ? 'text-th-accent' : 'text-slate-600'}`}>
            {isAlwaysOnTop ? 'ON' : 'OFF'}
          </span>
          <button
            type="button"
            onClick={() => setAlwaysOnTop(!isAlwaysOnTop)}
            className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-amber-300/50 active:scale-[0.96] ${isAlwaysOnTop ? 'bg-amber-400' : 'bg-slate-700'}`}
            aria-label="Always on top"
            aria-pressed={isAlwaysOnTop}
          >
            <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full shadow-sm transition-transform duration-200 ${isAlwaysOnTop ? 'translate-x-[18px] bg-th-pill-active-text' : 'translate-x-0.5 bg-slate-300'}`} />
          </button>
        </div>

        <div className="flex h-[48px] items-center gap-3">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-th-soft text-th-accent">
            <Gamepad2 className="h-3.5 w-3.5" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-th-primary">Discord Presence (RPC)</p>
            <p className="mt-0.5 text-[8px] text-slate-500">Display current track on Discord</p>
          </div>
          <span className={`font-mono text-[8px] font-bold uppercase ${enableDiscordRpc ? 'text-th-accent' : 'text-slate-600'}`}>
            {enableDiscordRpc ? 'ON' : 'OFF'}
          </span>
          <button
            type="button"
            onClick={() => setEnableDiscordRpc(!enableDiscordRpc)}
            className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-amber-300/50 active:scale-[0.96] ${enableDiscordRpc ? 'bg-amber-400' : 'bg-slate-700'}`}
            aria-label="Discord Presence"
            aria-pressed={enableDiscordRpc}
          >
            <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full shadow-sm transition-transform duration-200 ${enableDiscordRpc ? 'translate-x-[18px] bg-th-pill-active-text' : 'translate-x-0.5 bg-slate-300'}`} />
          </button>
        </div>

        <div className="flex h-[58px] items-center gap-3">
          <div className="w-[109px] flex-shrink-0">
            <p className="text-[10px] font-semibold text-th-primary">Startup Mode</p>
            <p className="mt-0.5 text-[8px] text-slate-500">Default view on launch</p>
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-4 gap-1 rounded-xl bg-th-soft p-1" role="group" aria-label="Startup Mode">
            {startupOptions.map((option) => {
              const isActive = startupMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStartupMode(option.value)}
                  className={`rounded-lg px-1 py-1.5 text-[8px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-amber-300/50 active:scale-[0.97] ${isActive ? 'bg-th-pill-active text-th-pill-active-text shadow-sm' : 'text-slate-500 hover:bg-th-soft-strong hover:text-th-primary'}`}
                  aria-pressed={isActive}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex h-[58px] items-center gap-3">
          <div className="w-[109px] flex-shrink-0">
            <p className="text-[10px] font-semibold text-th-primary">When Queue Ends</p>
            <p className="mt-0.5 text-[8px] text-slate-500">Playback behavior</p>
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-1 rounded-xl bg-th-soft p-1" role="group" aria-label="Playback behavior when queue ends">
            <button
              type="button"
              onClick={() => setQueueEndBehavior('stop')}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[8px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-amber-300/50 active:scale-[0.97] ${queueEndBehavior === 'stop' ? 'bg-th-pill-active text-th-pill-active-text shadow-sm' : 'text-slate-500 hover:bg-th-soft-strong hover:text-th-primary'}`}
              aria-pressed={queueEndBehavior === 'stop'}
            >
              <Square className="h-2.5 w-2.5 fill-current" /> Stop
            </button>
            <button
              type="button"
              onClick={() => setQueueEndBehavior('repeat-queue')}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[8px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-amber-300/50 active:scale-[0.97] ${queueEndBehavior === 'repeat-queue' ? 'bg-th-pill-active text-th-pill-active-text shadow-sm' : 'text-slate-500 hover:bg-th-soft-strong hover:text-th-primary'}`}
              aria-pressed={queueEndBehavior === 'repeat-queue'}
            >
              <Repeat2 className="h-3 w-3" /> Repeat Queue
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
