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
    },
  },
  test: {
    include: ['packages/**/test/**/*.test.ts', 'tools/**/test/**/*.test.ts'],
    environment: 'node',
    coverage: { provider: 'v8', include: ['packages/*/src/**'] },
  },
});
