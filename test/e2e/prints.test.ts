import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli, withTempHome } from '../helpers/cli.js';

describe('built print and shipping CLI', () => {
  it('exposes creator print, private upload and address-book commands', async () => {
    await withTempHome(async home => {
      for (const path of [
        ['prints', 'specifications'], ['prints', 'get'], ['prints', 'activity'], ['prints', 'releases'],
        ['prints', 'drops', 'create'], ['prints', 'drops', 'list'], ['prints', 'drops', 'get'],
        ['prints', 'drops', 'archive'], ['prints', 'drops', 'configure'], ['prints', 'drops', 'update'],
        ['prints', 'listing', 'prepare'], ['prints', 'listing', 'publish'],
        ['shipping', 'list'], ['shipping', 'save'], ['shipping', 'delete'], ['uploads', 'upload'], ['cart', 'card'],
        ['orders', 'list'], ['orders', 'get'],
      ]) {
        const result = await runCli([...path, '--help'], { home });
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('--api-url');
        expect(result.stdout).toContain('--storage');
      }
      const upload = await runCli(['uploads', 'upload', '--help'], { home });
      expect(upload.stdout).toContain('default: "public"');
    });
  });

  it('rejects public production URLs and malformed shipping input before authentication', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rare-print-input-'));
    try {
      const draft = join(directory, 'draft.json');
      await writeFile(draft, JSON.stringify({ name: 'Invalid draft', print: { productionImageUri: 'https://example.com/master.png' } }));
      const result = await runCli(['--json', 'prints', 'drops', 'create', '--input', draft]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('productionUploadKey');
      const address = join(directory, 'address.json');
      await writeFile(address, JSON.stringify({ details: { email: 'invalid' } }));
      const shipping = await runCli(['--json', 'shipping', 'save', '--input', address]);
      expect(shipping.code).toBe(1);
      expect(shipping.stderr).toContain('email');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('requires explicit consent before signing and publishing a Listing', async () => {
    const result = await runCli(['--json', 'prints', 'listing', 'publish', '--input', 'unused.json'], {
      env: { RARE_SKIP_CONFIRMATION: '0' },
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('requires --yes');
  });

  it('rejects conflicting shipping sources before any quote request', async () => {
    const result = await runCli(['--json', 'cart', 'checkout', '--listing', `0x${'1'.repeat(64)}`,
      '--payment-currency', 'usdc', '--shipping-input', 'unused.json',
      '--saved-address-id', '00000000-0000-4000-8000-000000000001', '--preview']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('not both');
  });

  it('rejects invalid print quantity limits and eligibility rules before authentication', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rare-print-policy-'));
    try {
      const file = join(directory, 'listing.json');
      const terms = {
        optionId: '00000000-0000-4000-8000-000000000001', seller: `0x${'1'.repeat(40)}`,
        listingSalt: `0x${'2'.repeat(64)}`, deadline: '2000000000', availableQuantity: '10', fulfillmentKind: 1,
      };
      for (const maxQuantityPerCheckout of ['0', '1001', '01', '-1', '1.5']) {
        await writeFile(file, JSON.stringify({ ...terms, maxQuantityPerCheckout }));
        const result = await runCli(['--json', 'prints', 'listing', 'prepare', '--input', file]);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain('maxQuantityPerCheckout');
      }
      await writeFile(file, JSON.stringify({ ...terms, eligibilityRuleId: 'invalid-rule' }));
      const result = await runCli(['--json', 'prints', 'listing', 'prepare', '--input', file]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('eligibilityRuleId');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
