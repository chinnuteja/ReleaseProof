import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@releaseproof/core': resolve('packages/core/src/index.ts'),
      '@releaseproof/contracts': resolve('packages/contracts/src/index.ts')
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000
  }
});
