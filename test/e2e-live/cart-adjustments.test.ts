import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runCli, parseJsonStdout, withTempHome } from '../helpers/cli.js';
const required = (name: string): string => {const value = process.env[name]; if (!value) throw new Error(`${name} is required for adjustment administration E2E.`); return value;};
describe('built adjustment administration CLI against a real Rare API', () => {
 it('creates a reusable charge, applies it to two SKUs, lists and disables assignments using an internal key', async () => {
  await withTempHome(async home => {
   const baseUrl = required('RARE_API_BASE_URL');
   const env = {GQL_API_KEY: required('GQL_API_KEY')};
   const args = ['--chain', 'sepolia', '--api-url', baseUrl, '--api-key-env', 'GQL_API_KEY'];
   const file = join(home, 'adjustment.json');
   await writeFile(file, JSON.stringify({effect: 'CHARGE', phase: 'LISTING_CONFIGURATION', code: 'GALLERY_COMMISSION', calculation: {type: 'PERCENTAGE', basisPoints: 3000, currencyMode: 'COMPONENT_CURRENCY'}, recipient: {type: 'FIXED', address: '0x1111111111111111111111111111111111111111'}}));
   const withoutConsent = await runCli(['--json', 'cart', 'adjustments', 'create', '--input', file, ...args], {home, env});
   expect(withoutConsent.code).toBe(1); expect(withoutConsent.stderr).toContain('--yes');
   const created = z.object({id: z.string(), effect: z.literal('CHARGE')}).parse(parseJsonStdout(await runCli(['--json', 'cart', 'adjustments', 'create', '--input', file, '--yes', ...args], {home, env})));
   const assignments = await Promise.all([1,2].map(async number => {
    const path = join(home, `assignment-${number}.json`);
    await writeFile(path, JSON.stringify({adjustmentId: created.id, priority: 200, scope: {skus: [`0x${randomBytes(32).toString('hex')}`]}}));
    return z.object({id: z.string(), adjustmentId: z.string()}).parse(parseJsonStdout(await runCli(['--json', 'cart', 'adjustments', 'assignments', 'create', '--input', path, '--yes', ...args], {home, env})));
   }));
   try {
    const page = z.object({data: z.array(z.object({id: z.string(), adjustmentId: z.string()}))}).parse(parseJsonStdout(await runCli(['--json', 'cart', 'adjustments', 'assignments', 'list', '--adjustment-id', created.id, ...args], {home, env})));
    expect(page.data.map(value => value.id).sort()).toEqual(assignments.map(value => value.id).sort());
    expect(page.data.every(value => value.adjustmentId === created.id)).toBe(true);
    const denied = await runCli(['--json', 'cart', 'adjustments', 'list', ...args], {home, env: {GQL_API_KEY: 'wrong-test-key'}});
    expect(denied.code).toBe(1); expect(denied.stdout + denied.stderr).toMatch(/401|authentication/i);
    expect(denied.stdout + denied.stderr).not.toContain('wrong-test-key');
   } finally {
    for (const assignment of assignments) expect(parseJsonStdout(await runCli(['--json', 'cart', 'adjustments', 'assignments', 'disable', '--id', assignment.id, '--yes', ...args], {home, env}))).toMatchObject({id: assignment.id, disabled: true});
   }
   const page = z.object({data: z.array(z.object({id: z.string()}))}).parse(parseJsonStdout(await runCli(['--json', 'cart', 'adjustments', 'list', '--per-page', '100', ...args], {home, env})));
   expect(page.data.some(value => value.id === created.id)).toBe(true);
  });
 }, 120000);
});
