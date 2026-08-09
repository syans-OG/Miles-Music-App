export interface FloatingRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface FloatingSize {
  width: number;
  height: number;
}

export const getFloatingMenuPosition = (
  anchor: FloatingRect,
  menu: FloatingSize,
  viewport: FloatingSize,
  margin = 8,
  gap = 6,
) => {
  const maxLeft = Math.max(margin, viewport.width - menu.width - margin);
  const maxTop = Math.max(margin, viewport.height - menu.height - margin);
  const left = Math.min(Math.max(margin, anchor.right - menu.width), maxLeft);
  const belowTop = anchor.bottom + gap;
  const aboveTop = anchor.top - menu.height - gap;
  const top = belowTop + menu.height <= viewport.height - margin
    ? belowTop
    : Math.min(Math.max(margin, aboveTop), maxTop);

  return { left, top };
};
