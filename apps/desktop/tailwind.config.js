/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Class-based rather than media-based: the app offers an explicit
  // light/dark choice as well as following the system, and a media query
  // cannot be overridden by a preference.
  darkMode: 'class',
  theme: {
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
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],
      },
      letterSpacing: {
        tightest: '-0.03em',
      },
    },
  },
  plugins: [],
};
