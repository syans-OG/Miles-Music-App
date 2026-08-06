import React from 'react';
import { Gamepad2, Pin, Repeat2, Settings, Square, Volume2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { usePlayerStore } from '../stores/usePlayerStore';
import { AppMode } from '../types/player';

const startupOptions: Array<{ value: 'last' | AppMode; label: string }> = [
  { value: 'last', label: 'Terakhir' },
  { value: 'control-bar', label: 'Full' },
  { value: 'vinyl-widget', label: 'Kotak' },
  { value: 'micro-bubble', label: 'Mini' },
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

  const volumeLabel = isMuted ? 'MUTE' : `${Math.round(volume * 100)}%`;

  return (
    <section className="h-[317px] overflow-y-auto overscroll-contain px-1 animate-fade-in" aria-labelledby="settings-panel-title">
      <header className="flex h-[37px] items-center justify-between border-b border-white/10">
        <div className="flex min-w-0 items-center gap-2">
          <Settings className="h-3.5 w-3.5 flex-shrink-0 text-amber-300" strokeWidth={1.8} />
          <h3 id="settings-panel-title" className="flex-shrink-0 text-[12px] font-bold tracking-tight text-white">Setting Miles</h3>
          <span className="truncate text-[8px] text-slate-500">Disimpan otomatis</span>
        </div>
        <span className="pt-1 font-mono text-[8px] uppercase tracking-[0.14em] text-slate-600">5 preferensi</span>
      </header>

      <div className="divide-y divide-white/10">
        <div className="flex h-[48px] items-center gap-3">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.045] text-amber-300">
            <Volume2 className="h-3.5 w-3.5" strokeWidth={1.8} />
          </div>
          <div className="w-[82px] flex-shrink-0">
            <p className="text-[10px] font-semibold text-white">Volume</p>
            <p className="mt-0.5 text-[8px] text-slate-500">Level tersimpan</p>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="Volume tersimpan"
            className="h-1 min-w-0 flex-1 cursor-pointer accent-amber-400 focus-visible:ring-2 focus-visible:ring-amber-300/50"
          />
          <span className="w-9 text-right font-mono text-[9px] font-bold text-amber-300">{volumeLabel}</span>
        </div>

        <div className="flex h-[48px] items-center gap-3">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.045] text-amber-300">
            <Pin className="h-3.5 w-3.5" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-white">Always on top</p>
            <p className="mt-0.5 text-[8px] text-slate-500">Miles tetap di atas aplikasi lain</p>
          </div>
          <span className={`font-mono text-[8px] font-bold uppercase ${isAlwaysOnTop ? 'text-amber-300' : 'text-slate-600'}`}>
            {isAlwaysOnTop ? 'Aktif' : 'Nonaktif'}
          </span>
          <button
            type="button"
            onClick={() => setAlwaysOnTop(!isAlwaysOnTop)}
            className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-amber-300/50 active:scale-[0.96] ${isAlwaysOnTop ? 'bg-amber-400' : 'bg-slate-700'}`}
            aria-label="Always on top"
            aria-pressed={isAlwaysOnTop}
          >
            <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full shadow-sm transition-transform duration-200 ${isAlwaysOnTop ? 'translate-x-[18px] bg-dark-900' : 'translate-x-0.5 bg-slate-300'}`} />
          </button>
        </div>

        <div className="flex h-[48px] items-center gap-3">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.045] text-amber-300">
            <Gamepad2 className="h-3.5 w-3.5" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-white">Status Discord (RPC)</p>
            <p className="mt-0.5 text-[8px] text-slate-500">Tampilkan lagu yang diputar di Discord</p>
          </div>
          <span className={`font-mono text-[8px] font-bold uppercase ${enableDiscordRpc ? 'text-amber-300' : 'text-slate-600'}`}>
            {enableDiscordRpc ? 'Aktif' : 'Nonaktif'}
          </span>
          <button
            type="button"
            onClick={() => setEnableDiscordRpc(!enableDiscordRpc)}
            className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-amber-300/50 active:scale-[0.96] ${enableDiscordRpc ? 'bg-amber-400' : 'bg-slate-700'}`}
            aria-label="Status Discord"
            aria-pressed={enableDiscordRpc}
          >
            <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full shadow-sm transition-transform duration-200 ${enableDiscordRpc ? 'translate-x-[18px] bg-dark-900' : 'translate-x-0.5 bg-slate-300'}`} />
          </button>
        </div>

        <div className="flex h-[58px] items-center gap-3">
          <div className="w-[109px] flex-shrink-0">
            <p className="text-[10px] font-semibold text-white">Mode saat startup</p>
            <p className="mt-0.5 text-[8px] text-slate-500">Tampilan pertama Miles</p>
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-4 gap-1 rounded-xl bg-white/[0.045] p-1" role="group" aria-label="Mode saat startup">
            {startupOptions.map((option) => {
              const isActive = startupMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStartupMode(option.value)}
                  className={`rounded-lg px-1 py-1.5 text-[8px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-amber-300/50 active:scale-[0.97] ${isActive ? 'bg-white text-dark-900 shadow-sm' : 'text-slate-500 hover:bg-white/5 hover:text-white'}`}
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
            <p className="text-[10px] font-semibold text-white">Saat antrean selesai</p>
            <p className="mt-0.5 text-[8px] text-slate-500">Perilaku playback</p>
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-1 rounded-xl bg-white/[0.045] p-1" role="group" aria-label="Perilaku saat antrean selesai">
            <button
              type="button"
              onClick={() => setQueueEndBehavior('stop')}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[8px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-amber-300/50 active:scale-[0.97] ${queueEndBehavior === 'stop' ? 'bg-white text-dark-900 shadow-sm' : 'text-slate-500 hover:bg-white/5 hover:text-white'}`}
              aria-pressed={queueEndBehavior === 'stop'}
            >
              <Square className="h-2.5 w-2.5 fill-current" /> Berhenti
            </button>
            <button
              type="button"
              onClick={() => setQueueEndBehavior('repeat-queue')}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[8px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-amber-300/50 active:scale-[0.97] ${queueEndBehavior === 'repeat-queue' ? 'bg-white text-dark-900 shadow-sm' : 'text-slate-500 hover:bg-white/5 hover:text-white'}`}
              aria-pressed={queueEndBehavior === 'repeat-queue'}
            >
              <Repeat2 className="h-3 w-3" /> Ulang Queue
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
