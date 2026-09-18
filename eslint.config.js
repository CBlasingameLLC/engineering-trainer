import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Lint configuration.
 *
 * Deliberately narrow. TypeScript already catches the class of problem most
 * lint rules police, so this adds only the rules that types cannot express —
 * floating promises, unchecked exhaustiveness, React hook dependency mistakes —
 * and leaves formatting alone entirely.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'apps/desktop/src-tauri/**',
      'content/**',
      // Assembled distribution bundles: generated output, and the copied
      // renderer inside them is minified code eslint has nothing to say about.
      'release/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // An unused parameter prefixed with _ is a documented placeholder, not a mistake.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // The mastery model is written against precise types; `any` there would
      // silently defeat the guarantees the domain package exists to provide.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'off',
    },
  },

  {
    // Node scripts: the CLI, config files and the end-to-end driver.
    files: ['**/*.mjs', '*.config.{js,ts}', 'tools/**/*.ts', 'apps/desktop/*.config.ts'],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['apps/desktop/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.es2023 } },
  },

  {
    files: ['apps/desktop/src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  {
    // Tests and the end-to-end driver deliberately construct malformed or
    // partial fixtures to prove validation rejects them.
    files: ['**/test/**/*.ts', 'apps/desktop/e2e/**/*.mjs'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  {
    // An e2e driver is a Node script that also ships snippets to be evaluated
    // inside the page — `page.waitForFunction` and `evaluateAll` callbacks run
    // in the browser, where `document` and `window` are real. Linting the file
    // under Node globals alone reports those as undefined.
    files: ['apps/desktop/e2e/**/*.mjs'],
    languageOptions: {
      globals: {
        document: 'readonly', window: 'readonly', Node: 'readonly',
        getComputedStyle: 'readonly', localStorage: 'readonly',
      },
    },
  },
);
