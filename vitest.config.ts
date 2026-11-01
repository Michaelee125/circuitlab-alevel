import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
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
  test: {
    include: ['packages/**/src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
    testTimeout: 15000,
  },
});
