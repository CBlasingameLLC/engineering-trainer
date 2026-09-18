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
        // Mastery bands. Used consistently everywhere a band is shown, so the
        // colour itself carries meaning rather than decoration.
        band: {
          gap: '#dc2626',
          developing: '#d97706',
          proficient: '#2563eb',
          mastered: '#ca8a04',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
