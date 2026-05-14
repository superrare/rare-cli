import { defineConfig } from 'vitest/config';

const runLiveE2E = process.argv.some((arg) => arg.includes('test/e2e-live'));
const liveE2EHookTimeoutMs = parsePositiveInt(process.env.E2E_LIVE_HOOK_TIMEOUT_MS, 3_600_000);

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    fileParallelism: true,
    include: runLiveE2E ? ['test/e2e-live/**/*.test.ts'] : ['test/**/*.test.ts'],
    exclude: [
      'node_modules/**',
      'dist/**',
      ...(runLiveE2E ? [] : ['test/e2e-live/**']),
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/sdk/**/*.ts',
        'src/swap/**/*.ts',
        'src/liquid/**/*.ts',
        'src/commands/*-core.ts',
        'src/config.ts',
        'src/contracts/addresses.ts',
        'src/data-access/**/*.ts',
      ],
      exclude: ['src/data-access/schema.d.ts', 'src/contracts/abis/**'],
    },
    testTimeout: runLiveE2E ? 600_000 : 10_000,
    hookTimeout: runLiveE2E ? liveE2EHookTimeoutMs : 10_000,
  },
});

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
