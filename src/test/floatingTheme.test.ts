import { beforeEach, describe, expect, it } from 'vitest';

import { applyTheme, DEFAULT_CUSTOM, useThemeStore } from '../stores/useThemeStore';

describe('floating transparent UI theme flag', () => {
  beforeEach(() => {
    useThemeStore.setState({ mode: 'dark', colorId: 'minimal', custom: DEFAULT_CUSTOM, floating: false });
    applyTheme('dark', 'minimal', DEFAULT_CUSTOM, false);
  });

  it('sets data-floating only when enabled', () => {
    applyTheme('dark', 'minimal', DEFAULT_CUSTOM, true);
    expect(document.documentElement.dataset.floating).toBe('on');
    applyTheme('dark', 'minimal', DEFAULT_CUSTOM, false);
    expect(document.documentElement.dataset.floating).toBeUndefined();
  });

  it('toggles floating through the store and persists it', () => {
    useThemeStore.getState().setFloating(true);
    expect(useThemeStore.getState().floating).toBe(true);
    expect(document.documentElement.dataset.floating).toBe('on');
    const persisted = JSON.parse(window.localStorage.getItem('miles_theme') ?? '{}') as {
      state?: { floating?: boolean };
    };
    expect(persisted.state?.floating).toBe(true);

    useThemeStore.getState().setFloating(false);
    expect(useThemeStore.getState().floating).toBe(false);
    expect(document.documentElement.dataset.floating).toBeUndefined();
  });
});