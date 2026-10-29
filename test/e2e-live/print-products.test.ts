import { describe, expect, it } from 'vitest';
import type { PrintProduct } from '@rareprotocol/rare-sdk';
import { parseJsonStdout, runCli, withTempHome } from '../helpers/cli.js';
import { loadDotEnv } from './env.mjs';

loadDotEnv();

describe('deployed public print products through the built CLI', () => {
  it('reads all eight presets and provider artwork guidance without signing in', async () => {
    const apiBaseUrl = process.env.RARE_API_BASE_URL;
    if (!apiBaseUrl) throw new Error('Set RARE_API_BASE_URL to a deployment with the print product API.');
    await withTempHome(async home => {
      const options = ['--api-url', apiBaseUrl, '--chain', 'sepolia'];
      const products = parseJsonStdout<PrintProduct[]>(await runCli(['--json', 'prints', 'products', 'list', ...options], { home }));
      expect(products.map(product => product.id).sort((left, right) => left.localeCompare(right))).toEqual([
        'GLOBAL-FAP-8X12', 'GLOBAL-FAP-12X18', 'GLOBAL-FAP-16X24', 'GLOBAL-FAP-24X36',
        'GLOBAL-FAP-8X8', 'GLOBAL-FAP-12X12', 'GLOBAL-FAP-16X16', 'GLOBAL-FAP-24X24',
      ].sort((left, right) => left.localeCompare(right)));
      const product = parseJsonStdout<PrintProduct>(await runCli(['--json', 'prints', 'products', 'get', '--id', 'GLOBAL-FAP-8X12', ...options], { home }));
      expect(product).toEqual(products.find(item => item.id === product.id));
      expect(product.printAreas).toContainEqual({ name: 'default', required: true, recommendedWidthPixels: 2400, recommendedHeightPixels: 3600 });
      expect(product.fileRequirements).toEqual({ acceptedContentTypes: ['image/jpeg', 'image/png'], maximumBytes: 250 * 1024 * 1024 });
      const human = await runCli(['prints', 'products', 'get', '--id', product.id, ...options], { home });
      expect(human.code).toBe(0);
      expect(human.stdout).toContain('Recommended width pixels: 2400');
    });
  });
});
