import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

const pkg = (name: string) =>
  fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url));

/**
 * GitHub Pages project sites are served from a sub-path
 * (https://<user>.github.io/circuitlab-alevel/), so the base path must never be
 * assumed to be "/". It is injected at build time and can be overridden for a
 * custom domain (see docs/github-deployment.md and docs/wechat-mini-program.md).
 */
const base = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@circuitlab/circuit-core': pkg('circuit-core'),
      '@circuitlab/physics-engine': pkg('physics-engine'),
      '@circuitlab/reasoning-engine': pkg('reasoning-engine'),
      '@circuitlab/teaching-engine': pkg('teaching-engine'),
      '@circuitlab/circuit-renderer': pkg('circuit-renderer'),
      '@circuitlab/ui': pkg('ui'),
      '@circuitlab/i18n': pkg('i18n'),
      '@circuitlab/platform-adapters': pkg('platform-adapters'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          pixi: ['pixi.js'],
          charts: ['echarts'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
