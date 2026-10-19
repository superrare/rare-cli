import { describe, expect, it } from 'vitest';
import { runCli, withTempHome } from '../helpers/cli.js';

describe('built eligibility CLI', () => {
  it('exposes authenticated rules, claims and Listing requirement commands', async () => {
    await withTempHome(async (home) => {
      const help = await runCli(['eligibility', '--help'], { home });
      expect(help.code).toBe(0);
      expect(help.stdout).toContain('rules');
      expect(help.stdout).toContain('claims');
      expect(help.stdout).toContain('listings');
      const create = await runCli(['cart', 'listing', 'create', '--help'], { home });
      expect(create.stdout).toContain('--eligibility-rule-id');
      for (const path of [['rules', 'create'], ['rules', 'list'], ['rules', 'disable'],
        ['claims', 'list'], ['listings', 'require'], ['listings', 'clear']]) {
        const result = await runCli(['eligibility', ...path, '--help'], { home });
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('--api-url');
        expect(result.stdout).toContain('--storage');
      }
    });
  });

  it('rejects malformed Listing digests before authentication', async () => {
    const result = await runCli(['--json', 'eligibility', 'listings', 'require',
      '--listing-digest', 'invalid', '--rule-id', 'rule']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('bytes32');
  });
});
