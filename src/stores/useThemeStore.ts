import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'dark' | 'light';
export type ThemeColorId = 'minimal' | 'emerald' | 'sunset' | 'custom';

export interface CustomColor {
  hue: number;
  sat: number;
  light: number;
  tint: number;
}

export const DEFAULT_CUSTOM: CustomColor = { hue: 157, sat: 70, light: 50, tint: 70 };

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = ((((h % 360) + 360) % 360) / 60) % 6;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = ln - c / 2;
  return [
    Math.round((rgb[0] + m) * 255),
    Math.round((rgb[1] + m) * 255),
    Math.round((rgb[2] + m) * 255),
  ];
};

const toHex = (h: number, s: number, l: number): string => {
  const [r, g, b] = hslToRgb(h, s, l);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

const triple = (h: number, s: number, l: number): string =>
  hslToRgb(h, s, l).join(' ');

const hsla = (h: number, s: number, l: number, a: number): string =>
  `hsla(${h}, ${s}%, ${l}%, ${a})`;

type Vars = Record<string, string>;

const accentLightFor = (mode: ThemeMode, light: number): number =>
  mode === 'dark' ? Math.round(lerp(42, 78, light / 100)) : Math.round(lerp(30, 50, light / 100));

const buildAccent = (h: number, sat: number, paletteLight: number): Vars => {
  const s = clamp(sat, 0, 100);
  const inkIsLight = paletteLight <= 46;
  const ink = inkIsLight ? '#ffffff' : toHex(h, 30, Math.max(paletteLight - 45, 8));
  return {
    '--th-a50': triple(h, 45, 95),
    '--th-a100': triple(h, 45, 90),
    '--th-a200': triple(h, 40, 82),
    '--th-a300': triple(h, clamp(s + 5, 0, 95), clamp(paletteLight + 4, 5, 88)),
    '--th-a400': triple(h, s, paletteLight),
    '--th-a500': triple(h, clamp(s - 8, 0, 95), clamp(paletteLight - 8, 5, 80)),
    '--th-a600': triple(h, clamp(s - 10, 0, 95), clamp(paletteLight - 14, 4, 75)),
    '--th-a700': triple(h, Math.round(s * 0.6), Math.round(paletteLight * 0.55)),
    '--th-a800': triple(h, Math.round(s * 0.5), 18),
    '--th-a900': triple(h, Math.round(s * 0.45), 10),
    '--th-a-ink': ink,
    '--th-a-soft': hsla(h, s, paletteLight, 0.16),
  };
};

const darkVars = (c: CustomColor): Vars => {
  const h = ((c.hue % 360) + 360) % 360;
  const t = clamp(c.tint, 0, 100) / 100;
  const a = accentLightFor('dark', c.light);
  const sat = (v: number): number => Math.round(v * t);
  const neutral: Array<[string, number, number]> = [
    ['50', sat(45), 95],
    ['100', sat(42), 88],
    ['200', sat(38), 80],
    ['300', sat(34), 71],
    ['400', sat(26), 57],
    ['500', sat(22), 45],
    ['600', sat(20), 30],
    ['700', sat(16), 21],
    ['800', sat(14), 11],
    ['900', sat(12), 7],
  ];
  const thRamp = Object.fromEntries(neutral.map(([step, s, l]) => [`--th-${step}`, toHex(h, s, l)]));
  return {
    ...thRamp,
    ...buildAccent(h, c.sat, a),
    '--th-surface': toHex(h, sat(12), 6),
    '--th-surface-top': toHex(h, sat(14), 9),
    '--th-surface-bottom': toHex(h, sat(12), 6),
    '--th-elevated': toHex(h, sat(14), 12),
    '--th-border': hsla(h, 30, 90, 0.07),
    '--th-border-strong': hsla(h, 30, 90, 0.12),
    '--th-hairline': hsla(h, 32, 95, 0.1),
    '--th-overlay': hsla(h, 32, 95, 0.05),
    '--th-overlay-strong': hsla(h, 32, 95, 0.12),
    '--th-pill-active': '#ffffff',
    '--th-pill-active-text': toHex(h, 35, 9),
    '--th-tt-top': toHex(h, sat(14), 9),
    '--th-tt-bot': toHex(h, sat(12), 6),
    '--th-tt-border': hsla(h, 30, 90, 0.14),
    '--th-tt-lit': hsla(h, 30, 92, 0.2),
    '--th-tt-ink': 'rgba(255, 255, 255, 0.5)',
    '--th-tt-soft': 'rgba(255, 255, 255, 0.6)',
    '--th-bubble-bg': hsla(h, sat(12), 6, 0.92),
    '--th-bubble-border': hsla(h, 30, 90, 0.2),
  };
};

const lightVars = (c: CustomColor): Vars => {
  const h = ((c.hue % 360) + 360) % 360;
  const t = clamp(c.tint, 0, 100) / 100;
  const a = accentLightFor('light', c.light);
  const sat = (v: number): number => Math.round(v * t);
  const neutral: Array<[string, number, number]> = [
    ['50', sat(40), 96],
    ['100', sat(34), 13],
    ['200', sat(30), 17],
    ['300', sat(26), 23],
    ['400', sat(22), 34],
    ['500', sat(20), 45],
    ['600', sat(26), 63],
    ['700', sat(35), 80],
    ['800', sat(40), 90],
    ['900', sat(42), 95],
  ];
  const thRamp = Object.fromEntries(neutral.map(([step, s, l]) => [`--th-${step}`, toHex(h, s, l)]));
  return {
    ...thRamp,
    ...buildAccent(h, c.sat, a),
    '--th-surface': toHex(h, sat(35), 94),
    '--th-surface-top': toHex(h, sat(40), 98),
    '--th-surface-bottom': toHex(h, sat(35), 94),
    '--th-elevated': '#ffffff',
    '--th-border': hsla(h, 28, 18, 0.08),
    '--th-border-strong': hsla(h, 28, 18, 0.14),
    '--th-hairline': 'rgba(255, 255, 255, 0.8)',
    '--th-overlay': hsla(h, 28, 18, 0.05),
    '--th-overlay-strong': hsla(h, 28, 18, 0.11),
    '--th-pill-active': toHex(h, Math.round(26 * t), 16),
    '--th-pill-active-text': '#ffffff',
    '--th-tt-top': toHex(h, sat(42), 97),
    '--th-tt-bot': toHex(h, sat(28), 81),
    '--th-tt-border': hsla(h, 28, 18, 0.16),
    '--th-tt-lit': 'rgba(255, 255, 255, 0.85)',
    '--th-tt-ink': hsla(h, 30, 20, 0.62),
    '--th-tt-soft': hsla(h, 30, 20, 0.55),
    '--th-bubble-bg': 'rgba(255, 255, 255, 0.94)',
    '--th-bubble-border': hsla(h, 28, 18, 0.18),
  };
};

const getCustomVars = (mode: ThemeMode, c: CustomColor): Vars =>
  mode === 'dark' ? darkVars(c) : lightVars(c);

export const CUSTOM_VAR_KEYS = Object.keys(getCustomVars('dark', DEFAULT_CUSTOM));

export const customAccentStyle = (mode: ThemeMode, c: CustomColor): string =>
  `hsl(${((c.hue % 360) + 360) % 360}, ${clamp(c.sat, 0, 100)}%, ${accentLightFor(mode, c.light)}%)`;

export const applyTheme = (mode: ThemeMode, colorId: ThemeColorId, custom: CustomColor = DEFAULT_CUSTOM, floating = false): void => {
  const root = document.documentElement;
  root.dataset.mode = mode;
  root.dataset.color = colorId;
  root.style.colorScheme = mode;
  if (floating) root.dataset.floating = 'on';
  else delete root.dataset.floating;
  for (const key of CUSTOM_VAR_KEYS) root.style.removeProperty(key);
  if (colorId === 'custom') {
    for (const [key, value] of Object.entries(getCustomVars(mode, custom))) {
      root.style.setProperty(key, value);
    }
  }
};

interface ThemeState {
  mode: ThemeMode;
  colorId: ThemeColorId;
  custom: CustomColor;
  floating: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  setColorId: (colorId: ThemeColorId) => void;
  setCustom: (patch: Partial<CustomColor>) => void;
  setFloating: (floating: boolean) => void;
}

const initialState = {
  mode: 'dark' as ThemeMode,
  colorId: 'minimal' as ThemeColorId,
  custom: DEFAULT_CUSTOM as CustomColor,
  floating: false,
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      ...initialState,
      setMode: (mode) => {
        set({ mode });
        applyTheme(mode, get().colorId, get().custom, get().floating);
      },
      toggleMode: () => {
        const next = get().mode === 'dark' ? 'light' : 'dark';
        get().setMode(next);
      },
      setColorId: (colorId) => {
        set({ colorId });
        applyTheme(get().mode, colorId, get().custom, get().floating);
      },
      setCustom: (patch) => {
        const custom = { ...get().custom, ...patch, light: 50, tint: 70 };
        set({ custom });
        if (get().colorId === 'custom') {
          applyTheme(get().mode, 'custom', custom, get().floating);
        }
      },
      setFloating: (floating) => {
        set({ floating });
        applyTheme(get().mode, get().colorId, get().custom, floating);
      },
    }),
    {
      name: 'miles_theme',
      version: 3,
      partialize: (state) => ({ mode: state.mode, colorId: state.colorId, custom: state.custom, floating: state.floating }),
      migrate: (persistedState, _version) => {
        const prev = persistedState as Partial<ThemeState> & { customHue?: number };
        const oldHue = typeof prev.customHue === 'number' ? prev.customHue : undefined;
        return {
          ...initialState,
          ...prev,
          custom: {
            ...DEFAULT_CUSTOM,
            ...(oldHue !== undefined ? { hue: oldHue } : {}),
            ...(prev.custom ?? {}),
          },
        };
      },
      onRehydrateStorage: () => (state) => {
        const mode = state?.mode ?? initialState.mode;
        const colorId = state?.colorId ?? initialState.colorId;
        const custom = state?.custom ?? initialState.custom;
        applyTheme(mode, colorId, custom, state?.floating ?? initialState.floating);
      },
    }
  )
);