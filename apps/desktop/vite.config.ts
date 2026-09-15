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
  // Bind both servers to an explicit IPv4 address rather than the default
  // `localhost`. On a dual-stack host `localhost` can resolve to ::1 first, so
  // Vite listens on IPv6 only while health checks and the end-to-end driver dial
  // 127.0.0.1 and find nothing there. Naming the interface removes the ambiguity
  // and keeps CI binding exactly the way a developer's machine does.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
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
