import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli, withTempHome } from '../helpers/cli.js';
describe('built Cart adjustment commands', () => {
 it('exposes reusable definitions and separate assignments', async () => {
  await withTempHome(async home => {
   for (const path of [['create'], ['list'], ['assignments', 'create'], ['assignments', 'list'], ['assignments', 'disable']]) {
    const help = await runCli(['cart', 'adjustments', ...path, '--help'], {home});
    expect(help.code).toBe(0); expect(help.stdout).not.toContain('--api-key-env');
    if (path.at(-1) !== 'list') expect(help.stdout).toContain('--yes');
   }
  });
 });
 it('rejects unsupported discounts and writes without consent before any API request', async () => {
  await withTempHome(async home => {
   const file = join(home, 'discount.json');
   await writeFile(file, JSON.stringify({effect: 'DISCOUNT'}));
   const args = ['--json', 'cart', 'adjustments', 'create', '--input', file, '--api-url', 'http://127.0.0.1:1', '--chain', 'sepolia'];
   const noConsent = await runCli(args, {home}); expect(noConsent.code).toBe(1); expect(noConsent.stderr).toContain('--yes');
   const unsupported = await runCli([...args, '--yes'], {home}); expect(unsupported.code).toBe(1); expect(unsupported.stderr + unsupported.stdout).toContain('CHARGE');
  });
 });
});
