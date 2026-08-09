import { describe, expect, it } from 'vitest';
import { getFloatingMenuPosition } from '../utils/floatingMenuPosition';

describe('getFloatingMenuPosition', () => {
  const menu = { width: 112, height: 172 };
  const viewport = { width: 400, height: 500 };

  it('places the menu below the trigger when space is available', () => {
    expect(getFloatingMenuPosition(
      { top: 40, right: 300, bottom: 64, left: 276 },
      menu,
      viewport,
    )).toEqual({ left: 188, top: 70 });
  });

  it('places the menu above the trigger near the bottom edge', () => {
    expect(getFloatingMenuPosition(
      { top: 450, right: 300, bottom: 474, left: 276 },
      menu,
      viewport,
    )).toEqual({ left: 188, top: 272 });
  });

  it('clamps the menu inside the horizontal viewport margin', () => {
    expect(getFloatingMenuPosition(
      { top: 40, right: 54, bottom: 64, left: 30 },
      menu,
      viewport,
    )).toEqual({ left: 8, top: 70 });
  });
});
