import { useSyncExternalStore } from 'react';

/**
 * Interface scale.
 *
 * The same complaint arrives from two different machines: on a fourteen-inch
 * laptop the app is about right, and on a twenty-seven-inch panel three feet
 * away every label is a step too small. Those are not the same request, and no
 * single set of pixel sizes satisfies both — which is why the whole interface
 * is expressed in rem and this module owns the one number they resolve
 * against.
 *
 * It scales more than type. Tailwind's spacing scale is rem too, so a step up
 * widens the padding inside every panel, the gaps between them and the
 * navigation rail by the same proportion. That is the point: the request was
 * "bigger boxes", not "bigger words in the same boxes".
 *
 * Sits in `localStorage` beside the theme, for the same reason — it is a
 * per-device display preference and has no business appearing in an export of
 * someone's learning history.
 */

export type Scale = 'compact' | 'normal' | 'large' | 'larger';

/**
 * Root font sizes in CSS pixels.
 *
 * `normal` is 17px rather than the browser's 16px default because the sizes
 * this replaced were literal pixels tuned on a laptop, and reproducing them
 * exactly would have shipped the complaint.
 */
const PX: Record<Scale, number> = {
  compact: 15,
  normal: 17,
  large: 18.5,
  larger: 20,
};

export const SCALES: readonly Scale[] = ['compact', 'normal', 'large', 'larger'];

export const SCALE_LABEL: Record<Scale, string> = {
  compact: 'S',
  normal: 'M',
  large: 'L',
  larger: 'XL',
};

const STORAGE_KEY = 'et.scale';
const listeners = new Set<() => void>();

const isScale = (value: unknown): value is Scale =>
  typeof value === 'string' && (SCALES as readonly string[]).includes(value);

function read(): Scale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isScale(stored) ? stored : 'normal';
  } catch {
    // Private windows and locked-down WebViews throw on access rather than
    // returning null. A missing preference is not an error.
    return 'normal';
  }
}

let current: Scale = read();

function apply(): void {
  document.documentElement.style.fontSize = `${PX[current]}px`;
}

export function setScale(scale: Scale): void {
  current = scale;
  try {
    localStorage.setItem(STORAGE_KEY, scale);
  } catch {
    // Preference is not persisted, but the session still honours it.
  }
  apply();
  for (const listener of listeners) listener();
}

/** Cycle through the four steps and wrap, which is the whole control. */
export const nextScale = (scale: Scale): Scale =>
  SCALES[(SCALES.indexOf(scale) + 1) % SCALES.length]!;

/** Set the root size before the first paint so nothing reflows on load. */
export const initScale = (): void => apply();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useScale = (): Scale => useSyncExternalStore(subscribe, () => current, () => current);
