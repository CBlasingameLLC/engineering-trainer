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
  build: {
    // Tauri expects a fixed output directory it can bundle.
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      // Only reachable inside the Tauri shell, which provides it at runtime.
      // Marking it external keeps the browser build - the one the end-to-end
      // verification runs against - buildable without a Tauri toolchain.
      external: ['@tauri-apps/plugin-sql'],
    },
  },
});
