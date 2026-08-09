# CD Action Menu Portal Fix

## Problem

The CD action menu is rendered inside a transformed virtual row. Each row creates
its own stacking context, so later rows can paint above the menu. The drawer's
scroll container can also clip the menu.

## Approved Direction

Render the menu through a React portal into `document.body` and position it from
the three-dot trigger's viewport rectangle. Keep the existing compact visual
language and the five existing actions.

## Behavior

- Align the menu's right edge to the trigger and open below it by default.
- Flip above the trigger when there is not enough room below.
- Clamp both axes to an 8px viewport margin.
- Close on outside pointer interaction, Escape, scrolling, resizing, tab changes,
  or settings changes.
- Preserve keyboard focus and expose menu semantics through ARIA roles.

## Verification

- Unit-test below placement, upward placement, and horizontal viewport clamping.
- Run TypeScript checks, the complete frontend test suite, and a production build.
- Run the Impeccable detector once after implementation.
