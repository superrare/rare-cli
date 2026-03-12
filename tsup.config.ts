import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node24',
  banner: {
    js: '#!/usr/bin/env node',
  },
  clean: true,
  sourcemap: false,
  splitting: false,
});
