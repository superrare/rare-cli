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
      client: 'src/exports/client.ts',
      contracts: 'src/exports/contracts.ts',
      utils: 'src/exports/utils.ts',
    },
    format: ['esm'],
    target: 'node22',
    clean: false,
    dts: true,
    sourcemap: false,
    splitting: false,
  },
]);
