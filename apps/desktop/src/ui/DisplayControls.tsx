import { useCallback, useEffect, useState } from 'react';
import { isFullscreen, nextTheme, setTheme, toggleFullscreen, useTheme } from '@/ui/theme';

/**
 * Theme and fullscreen controls.
 *
 * Fixed rather than placed in a route header, because the routes do not all
 * have one — and because leaving fullscreen needs to be possible from whatever
 * screen you entered it on. Escape also works in both shells, but a visible
 * way out is worth the corner.
 */

const LABEL = { system: 'Auto', light: 'Light', dark: 'Dark' } as const;

export function DisplayControls(): React.ReactElement {
  const theme = useTheme();
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
    <div className="fixed right-2 top-2 z-50 flex items-center gap-px" data-testid="display-controls">
      <button
        type="button"
        onClick={() => setTheme(nextTheme(theme))}
        title={`Theme: ${LABEL[theme]} — click to change`}
        data-testid="theme-toggle"
        data-theme={theme}
        className="border border-line bg-surface/85 px-1.5 py-0.5 font-mono text-[10px] uppercase
                   tracking-[0.08em] text-ink-faint backdrop-blur transition-colors
                   hover:border-accent hover:text-accent"
      >
        {LABEL[theme]}
      </button>
      <button
        type="button"
        onClick={onFullscreen}
        title={full ? 'Leave fullscreen' : 'Enter fullscreen'}
        data-testid="fullscreen-toggle"
        data-fullscreen={full ? 'true' : 'false'}
        className="border border-line bg-surface/85 px-1.5 py-0.5 font-mono text-[10px] uppercase
                   tracking-[0.08em] text-ink-faint backdrop-blur transition-colors
                   hover:border-accent hover:text-accent"
      >
        {full ? 'Exit' : 'Full'}
      </button>
    </div>
  );
}
