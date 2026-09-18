import { useSyncExternalStore } from 'react';

/**
 * Theme and fullscreen.
 *
 * Both are per-device display preferences rather than learning data, so they
 * live in `localStorage` and never touch the storage adapter. That split
 * matters: the attempt log is the durable record the whole mastery model
 * replays from, and mixing a display toggle into it would mean a theme change
 * showed up in an export of someone's learning history.
 *
 * `system` is the default and is a live subscription, not a one-time read — a
 * machine that switches to dark at sunset should take the app with it without
 * needing a restart.
 */

export type Theme = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'et.theme';
const listeners = new Set<() => void>();

let current: Theme = read();

function read(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  } catch {
    // Private windows and locked-down WebViews throw on access rather than
    // returning null. A missing preference is not an error.
    return 'system';
  }
}

const prefersDark = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

/** Whether the dark palette should be applied right now. */
export const isDark = (theme: Theme = current): boolean =>
  theme === 'dark' || (theme === 'system' && prefersDark());

function apply(): void {
  const root = document.documentElement;
  const dark = isDark();
  root.classList.toggle('dark', dark);
  // Tells the browser to render native controls, scrollbars and form widgets
  // in the matching palette; without it a dark page keeps light scrollbars.
  root.style.colorScheme = dark ? 'dark' : 'light';
}

export function setTheme(theme: Theme): void {
  current = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Preference is not persisted, but the session still honours it.
  }
  apply();
  for (const listener of listeners) listener();
}

/** Cycle system → light → dark → system, which is the whole control. */
export const nextTheme = (theme: Theme): Theme =>
  theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';

/** Install the initial class and follow the OS while the preference is `system`. */
export function initTheme(): void {
  apply();
  if (typeof matchMedia !== 'function') return;
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (current === 'system') {
      apply();
      for (const listener of listeners) listener();
    }
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useTheme = (): Theme => useSyncExternalStore(subscribe, () => current, () => current);

// ---------------------------------------------------------------------------
// Fullscreen
// ---------------------------------------------------------------------------

/**
 * Fullscreen through whichever mechanism is actually present.
 *
 * The desktop shell owns a real OS window, so it goes through the Tauri window
 * API; the browser build has no window to resize and uses the DOM Fullscreen
 * API instead. The import is dynamic and behind `isTauri()` for the same reason
 * the SQL plugin is: a static import would pull Tauri internals into the
 * browser bundle, where they cannot resolve.
 */
export async function toggleFullscreen(): Promise<boolean> {
  if (typeof globalThis === 'object' && '__TAURI_INTERNALS__' in globalThis) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    const next = !(await win.isFullscreen());
    await win.setFullscreen(next);
    return next;
  }

  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return false;
  }
  await document.documentElement.requestFullscreen();
  return true;
}

export async function isFullscreen(): Promise<boolean> {
  if (typeof globalThis === 'object' && '__TAURI_INTERNALS__' in globalThis) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return getCurrentWindow().isFullscreen();
  }
  return document.fullscreenElement !== null;
}
