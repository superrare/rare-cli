import { defineConfig } from 'vitest/config';

const runLiveE2E = process.argv.some((arg) => arg.includes('test/e2e-live'));

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: runLiveE2E ? ['test/e2e-live/**/*.test.ts'] : ['test/**/*.test.ts'],
    exclude: [
      'node_modules/**',
      'dist/**',
      ...(runLiveE2E ? [] : ['test/e2e-live/**']),
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/sdk/**/*.ts', 'src/contracts/addresses.ts', 'src/data-access/**/*.ts'],
      exclude: ['src/data-access/schema.d.ts', 'src/contracts/abis/**'],
    },
    testTimeout: runLiveE2E ? 600_000 : 10_000,
    hookTimeout: runLiveE2E ? 600_000 : 10_000,
  },
});
