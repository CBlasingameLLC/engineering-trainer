import { useCallback, useEffect, useState } from 'react';
import { SCALE_LABEL, nextScale, setScale, useScale } from '@/ui/scale';
import { isFullscreen, nextTheme, setTheme, toggleFullscreen, useTheme } from '@/ui/theme';

/**
 * Theme, scale and fullscreen controls.
 *
 * Fixed rather than placed in a route header, because the routes do not all
 * have one — and because leaving fullscreen needs to be possible from whatever
 * screen you entered it on. Escape also works in both shells, but a visible
 * way out is worth the corner.
 *
 * All three are display preferences, all three cycle on click rather than
 * opening a menu, and none of them touches the storage adapter.
 *
 * They live in the status strip on every screen that has one. Floating them
 * over the top-right corner put them on top of whatever that corner held —
 * which on the briefing was the term and week, a line of text they covered
 * exactly. Onboarding has no strip yet, so there they still float.
 */

/** One class for all three, so the corner reads as one control rather than three. */
const CHIP =
  'border border-line bg-surface/85 px-1.5 py-0.5 font-mono text-3xs uppercase ' +
  'tracking-[0.08em] text-ink-faint backdrop-blur transition-colors ' +
  'hover:border-accent hover:text-accent';

const LABEL = { system: 'Auto', light: 'Light', dark: 'Dark' } as const;

export function DisplayControls({ floating = false }: { floating?: boolean } = {}): React.ReactElement {
  const theme = useTheme();
  const scale = useScale();
  const [full, setFull] = useState(false);

  useEffect(() => {
    void isFullscreen().then(setFull).catch(() => setFull(false));
    const onChange = (): void => setFull(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const onFullscreen = useCallback(() => {
    void toggleFullscreen()
      .then(setFull)
      // A WebView can refuse the request (no user gesture, or a policy). Leaving
      // the button in a lying state would be worse than doing nothing.
      .catch(() => void isFullscreen().then(setFull).catch(() => undefined));
  }, []);

  return (
    <div
      className={
        floating
          ? 'fixed right-2 top-2 z-50 flex items-center gap-px'
          : 'flex shrink-0 items-center gap-px'
      }
      data-testid="display-controls"
    >
      <button
        type="button"
        onClick={() => setTheme(nextTheme(theme))}
        title={`Theme: ${LABEL[theme]} — click to change`}
        data-testid="theme-toggle"
        data-theme={theme}
        className={CHIP}
      >
        {LABEL[theme]}
      </button>
      <button
        type="button"
        onClick={() => setScale(nextScale(scale))}
        title={`Interface scale: ${SCALE_LABEL[scale]} — click to change`}
        data-testid="scale-toggle"
        data-scale={scale}
        className={CHIP}
      >
        {SCALE_LABEL[scale]}
      </button>
      <button
        type="button"
        onClick={onFullscreen}
        title={full ? 'Leave fullscreen' : 'Enter fullscreen'}
        data-testid="fullscreen-toggle"
        data-fullscreen={full ? 'true' : 'false'}
        className={CHIP}
      >
        {full ? 'Exit' : 'Full'}
      </button>
    </div>
  );
}
