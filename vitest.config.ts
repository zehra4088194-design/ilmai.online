import { defineConfig } from 'vitest/config';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [{
    name: 'test-tsx-transform',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.tsx')) return null;
      const result = ts.transpileModule(code, {
        fileName: id,
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
        },
      });
      return { code: result.outputText, map: null };
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
