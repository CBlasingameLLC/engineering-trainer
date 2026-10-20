import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@et/domain': r('./packages/domain/src/index.ts'),
      '@et/content-schema': r('./packages/content-schema/src/index.ts'),
      '@et/answer-engine': r('./packages/answer-engine/src/index.ts'),
      '@et/generators': r('./packages/generators/src/index.ts'),
      '@et/circuits': r('./packages/circuits/src/index.ts'),
      // The renderer's own alias, so app-level logic can be unit tested at all.
      '@': r('./apps/desktop/src'),
    },
  },
  test: {
    // `apps/desktop` holds orchestration, not mastery logic, and mostly does
    // not want unit tests — but progress transfer is the exception: it decides
    // what happens to a learning history when two machines disagree, and a
    // mistake there loses evidence silently.
    include: [
      'packages/**/test/**/*.test.ts',
      'tools/**/test/**/*.test.ts',
      'apps/**/test/**/*.test.ts',
    ],
    environment: 'node',
    coverage: { provider: 'v8', include: ['packages/*/src/**'] },
  },
});
