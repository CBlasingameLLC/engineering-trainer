/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Class-based rather than media-based: the app offers an explicit
  // light/dark choice as well as following the system, and a media query
  // cannot be overridden by a preference.
  darkMode: 'class',
  theme: {
    /*
     * The type scale, in rem and replacing Tailwind's rather than extending it.
     *
     * Two things were wrong with the arbitrary pixel sizes it replaces. They
     * were a step too small on a large monitor and there was no way to say so:
     * a `text-[11px]` label is eleven pixels on a 14-inch laptop and eleven
     * pixels on a 32-inch panel three feet away, which are not the same
     * request. And because they were literal, the same size was spelled four
     * different ways across thirteen routes with nothing tying them together.
     *
     * In rem the whole interface — type, padding, gaps, the navigation rail,
     * every Tailwind spacing step — scales from one number, which is what makes
     * the scale control in `ui/scale.ts` a single line rather than a second
     * stylesheet. The comments give the rendered size at the default 17px root.
     */
    fontSize: {
      '3xs': ['0.6875rem', { lineHeight: '0.9375rem' }], // 11.7px
      '2xs': ['0.75rem', { lineHeight: '1.0625rem' }], //    12.8px
      xs: ['0.8125rem', { lineHeight: '1.125rem' }], //      13.8px
      sm: ['0.875rem', { lineHeight: '1.25rem' }], //        14.9px
      base: ['0.9375rem', { lineHeight: '1.375rem' }], //    15.9px
      lg: ['1.0625rem', { lineHeight: '1.5rem' }], //        18.1px
      xl: ['1.25rem', { lineHeight: '1.65rem' }], //         21.3px
      '2xl': ['1.5rem', { lineHeight: '1.75rem' }], //       25.5px
      '3xl': ['1.9375rem', { lineHeight: '2.15rem' }], //    33.0px
      '4xl': ['2.5rem', { lineHeight: '2.7rem' }], //        42.5px
    },
    extend: {
      colors: {
        // Every colour is a role, defined once per theme in `index.css`. A
        // literal palette scale here is what produced `bg-white dark:bg-slate-900`
        // on three hundred elements and two themes that were never designed
        // together.
        bg: 'var(--bg)',
        surface: { DEFAULT: 'var(--surface)', 2: 'var(--surface-2)' },
        line: { DEFAULT: 'var(--line)', strong: 'var(--line-strong)' },
        ink: { DEFAULT: 'var(--text)', dim: 'var(--text-dim)', faint: 'var(--text-faint)' },
        accent: {
          DEFAULT: 'var(--accent)',
          dim: 'var(--accent-dim)',
          bright: 'var(--accent-bright)',
          fg: 'var(--accent-fg)',
        },
        danger: 'var(--danger)',
        warn: 'var(--warn)',
        info: 'var(--info)',
        gold: 'var(--gold)',

        // Mastery bands. Used wherever a band is shown, so the colour itself
        // carries meaning rather than decoration. `mastered` is the app accent
        // on purpose: green means settled everywhere in this interface.
        // Knowledge-map edges. Tokens rather than literal hex because the graph
        // was the one screen that never changed when the theme did.
        edge: { DEFAULT: 'var(--edge)', cross: 'var(--edge-cross)' },

        band: {
          gap: 'var(--band-gap)',
          developing: 'var(--band-developing)',
          proficient: 'var(--band-proficient)',
          mastered: 'var(--band-mastered)',
        },
      },
      borderRadius: {
        // Square by default. Rounded cards are the house style of every
        // generated dashboard; an instrument has edges.
        DEFAULT: '0px',
        sm: '1px',
        md: '2px',
        lg: '2px',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Inter', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.03em',
      },
    },
  },
  plugins: [],
};
