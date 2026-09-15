import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': r('./src'),
      '@et/domain': r('../../packages/domain/src/index.ts'),
      '@et/content-schema': r('../../packages/content-schema/src/index.ts'),
      '@et/answer-engine': r('../../packages/answer-engine/src/index.ts'),
      '@et/generators': r('../../packages/generators/src/index.ts'),
    },
  },
  server: { port: 5173, strictPort: true },
  // Tauri expects a fixed output directory it can bundle.
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});
