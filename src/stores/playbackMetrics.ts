import { create } from 'zustand';

interface PlaybackMetricsState {
  currentTime: number;
  duration: number;
  setCurrentTime: (currentTime: number) => void;
  setDuration: (duration: number) => void;
}

export const usePlaybackMetrics = create<PlaybackMetricsState>((set) => ({
  currentTime: 0,
  duration: 0,
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
}));