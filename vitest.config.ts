import { defineConfig } from 'vitest/config';
import { transformWithEsbuild } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [{
    name: 'test-tsx-transform',
    enforce: 'pre',
    async transform(code, id) {
      if (!id.endsWith('.tsx')) return null;
      return transformWithEsbuild(code, id, {
        loader: 'tsx',
        jsx: 'automatic',
        tsconfigRaw: { compilerOptions: { jsx: 'react-jsx' } },
      });
    },
  }],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/server-only.ts', import.meta.url)),
    },
  },
  test: { include: ['tests/**/*.test.{ts,tsx}'], environment: 'node', testTimeout: 20000, maxWorkers: 1 },
});
