import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { haptic } from './feedback';

export interface DragState {
  key: string;
  /** Pointer travel since pick-up, applied as a transform to the dragged card. */
  dx: number;
  dy: number;
  /** The drop zone under the pointer, only when dropping there is allowed. */
  overDate: string | null;
}

interface Options {
  /** Whether `key` may be dropped on `date`. Zones that say no never highlight. */
  canDrop: (key: string, date: string) => boolean;
  onDrop: (key: string, date: string) => void;
  /** Touch pick-up delay. Shorter than a scroll, longer than a tap. */
  holdMs?: number;
}

interface Press {
  key: string;
  pointerId: number;
  startX: number;
  startY: number;
  touch: boolean;
  picked: boolean;
  timer: number | undefined;
}

const MOUSE_SLOP = 4;
const TOUCH_SLOP = 8;

/**
 * Press-and-drag for cards over `[data-date]` drop zones, built on pointer events so one code path serves
 * mouse and touch. On touch a card is picked up by holding (so scrolling still works); once it is up, page
 * scrolling is blocked until release. Escape or a system cancel (iOS taking over for a scroll) puts it back.
 */
export function useDragMove({ canDrop, onDrop, holdMs = 250 }: Options) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const press = useRef<Press | null>(null);
  const dragging = useRef(false);
  const options = useRef({ canDrop, onDrop });
  options.current = { canDrop, onDrop };
  const detach = useRef<(() => void) | null>(null);

  // iOS only honors preventDefault on touchmove from a non-passive listener registered ahead of time.
  useEffect(() => {
    const block = (event: TouchEvent) => { if (dragging.current && event.cancelable) event.preventDefault(); };
    document.addEventListener('touchmove', block, { passive: false });
    return () => document.removeEventListener('touchmove', block);
  }, []);

  const finish = useCallback(() => {
    const current = press.current;
    if (current?.timer !== undefined) window.clearTimeout(current.timer);
    press.current = null;
    dragging.current = false;
    detach.current?.();
    detach.current = null;
    setDrag(null);
  }, []);

  useEffect(() => finish, [finish]);

  const zoneUnder = (x: number, y: number): string | null =>
    document.elementFromPoint(x, y)?.closest('[data-date]')?.getAttribute('data-date') ?? null;

  const bind = (key: string) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (press.current) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if ((event.target as HTMLElement).closest('button, a, input, select, textarea')) return;
      const touch = event.pointerType !== 'mouse';
      const state: Press = { key, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, touch, picked: false, timer: undefined };
      press.current = state;

      const pickUp = () => {
        state.picked = true;
        dragging.current = true;
        haptic('select');
        setDrag({ key, dx: 0, dy: 0, overDate: null });
      };
      if (touch) state.timer = window.setTimeout(pickUp, holdMs);

      const move = (e: PointerEvent) => {
        if (e.pointerId !== state.pointerId) return;
        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;
        const distance = Math.hypot(dx, dy);
        if (!state.picked) {
          // Moving before the hold finishes means the person is scrolling, not dragging.
          if (touch && distance > TOUCH_SLOP) finish();
          else if (!touch && distance > MOUSE_SLOP) pickUp();
          if (!state.picked) return;
        }
        const date = zoneUnder(e.clientX, e.clientY);
        setDrag({ key, dx, dy, overDate: date && options.current.canDrop(key, date) ? date : null });
      };
      const up = (e: PointerEvent) => {
        if (e.pointerId !== state.pointerId) return;
        const date = state.picked ? zoneUnder(e.clientX, e.clientY) : null;
        const allowed = date !== null && options.current.canDrop(key, date);
        finish();
        if (allowed && date) {
          haptic('select');
          options.current.onDrop(key, date);
        }
      };
      const cancel = (e: PointerEvent) => { if (e.pointerId === state.pointerId) finish(); };
      const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); };
      const noMenu = (e: Event) => { if (state.picked) e.preventDefault(); };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', escape);
      window.addEventListener('contextmenu', noMenu);
      detach.current = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('keydown', escape);
        window.removeEventListener('contextmenu', noMenu);
      };
    },
  });

  return { drag, bind };
}
