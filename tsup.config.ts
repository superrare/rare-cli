import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'node22',
    banner: {
      js: '#!/usr/bin/env node',
    },
    clean: true,
    sourcemap: false,
    splitting: false,
  },
  {
    entry: {
      client: 'src/sdk/index.ts',
      contracts: 'src/sdk/contracts.ts',
      utils: 'src/sdk/public-utils.ts',
    },
    format: ['esm'],
    target: 'node22',
    clean: false,
    dts: true,
    sourcemap: false,
    splitting: false,
  },
]);
