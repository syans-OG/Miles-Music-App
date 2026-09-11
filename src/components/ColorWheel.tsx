import React, { useRef } from 'react';

interface ColorWheelProps {
  hue: number;
  sat: number;
  onChange: (hue: number, sat: number) => void;
}

const SIZE = 132;
const R = SIZE / 2;

export const ColorWheel: React.FC<ColorWheelProps> = ({ hue, sat, onChange }) => {
  const discRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const updateFromEvent = (clientX: number, clientY: number) => {
    const disc = discRef.current;
    if (!disc) return;
    const rect = disc.getBoundingClientRect();
    const dx = clientX - (rect.left + R);
    const dy = clientY - (rect.top + R);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const nextHue = Math.round(((angle + 360) % 360 + 360) % 360);
    const radius = Math.min(Math.hypot(dx, dy), R);
    const nextSat = Math.round((radius / R) * 100);
    onChange(nextHue, nextSat);
  };

  const handlePointerDown: React.PointerEventHandler = (event) => {
    draggingRef.current = true;
    updateFromEvent(event.clientX, event.clientY);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // some synthetic/edge pointers cannot be captured; drag still works without it
    }
  };

  const handlePointerMove: React.PointerEventHandler = (event) => {
    if (!draggingRef.current) return;
    updateFromEvent(event.clientX, event.clientY);
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
  };

  const handleKeyDown: React.KeyboardEventHandler = (event) => {
    const step =
      event.shiftKey
        ? 15
        : 1;
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        onChange(((hue - step) % 360 + 360) % 360, sat);
        break;
      case 'ArrowRight':
        event.preventDefault();
        onChange((hue + step) % 360, sat);
        break;
      case 'ArrowUp':
        event.preventDefault();
        onChange(hue, Math.min(100, sat + (event.shiftKey ? 10 : 3)));
        break;
      case 'ArrowDown':
        event.preventDefault();
        onChange(hue, Math.max(0, sat - (event.shiftKey ? 10 : 3)));
        break;
      default:
        break;
    }
  };

  const hueRad = (hue * Math.PI) / 180;
  const handleX = R + Math.cos(hueRad) * (sat / 100) * R;
  const handleY = R + Math.sin(hueRad) * (sat / 100) * R;

  return (
    <div
      ref={discRef}
      role="slider"
      tabIndex={0}
      aria-label="Accent color wheel"
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={hue}
      aria-valuetext={`Hue ${hue} degrees, saturation ${sat} percent`}
      className="color-wheel"
      style={{ width: SIZE, height: SIZE }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
    >
      <span
        className="color-wheel-handle"
        style={{ left: handleX, top: handleY }}
        aria-hidden="true"
      />
    </div>
  );
};