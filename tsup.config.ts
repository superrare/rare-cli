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
    entry: { client: 'src/exports/client.ts' },
    format: ['esm'],
    target: 'node22',
    clean: false,
    dts: {
      banner: '/** @deprecated Import from `@rareprotocol/rare-sdk/client` instead. */',
    },
    sourcemap: false,
    splitting: false,
  },
  {
    entry: { contracts: 'src/exports/contracts.ts' },
    format: ['esm'],
    target: 'node22',
    clean: false,
    dts: {
      banner: '/** @deprecated Import from `@rareprotocol/rare-sdk/contracts` instead. */',
    },
    sourcemap: false,
    splitting: false,
  },
  {
    entry: { utils: 'src/exports/utils.ts' },
    format: ['esm'],
    target: 'node22',
    clean: false,
    dts: {
      banner: '/** @deprecated Import from `@rareprotocol/rare-sdk/utils` instead. */',
    },
    sourcemap: false,
    splitting: false,
  },
]);
