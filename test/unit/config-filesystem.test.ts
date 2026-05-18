import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('config filesystem handling', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('does not treat malformed config JSON as an empty config during wallet setup', async () => {
    const home = await mkdtemp(join(tmpdir(), 'rare-cli-config-home-'));
    const configDir = join(home, '.rare');
    const configPath = join(configDir, 'config.json');
    const malformedConfig = '{ "chains": ';

    try {
      await mkdir(configDir, { recursive: true });
      await writeFile(configPath, malformedConfig, 'utf8');
      vi.stubEnv('HOME', home);
      vi.stubEnv('USERPROFILE', home);
      vi.resetModules();

      const { getWalletClient } = await import('../../src/client.js');

      expect(() => getWalletClient('sepolia')).toThrow(
        `Failed to parse rare config at ${configPath}.`,
      );
      await expect(readFile(configPath, 'utf8')).resolves.toBe(malformedConfig);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it('writes config files with owner-only permissions', async () => {
    const home = await mkdtemp(join(tmpdir(), 'rare-cli-config-home-'));
    const configDir = join(home, '.rare');
    const configPath = join(configDir, 'config.json');

    try {
      await mkdir(configDir, { recursive: true });
      await writeFile(configPath, '{}', 'utf8');
      await chmod(configDir, 0o755);
      await chmod(configPath, 0o644);
      vi.stubEnv('HOME', home);
      vi.stubEnv('USERPROFILE', home);
      vi.resetModules();

      const { writeConfig } = await import('../../src/config.js');

      writeConfig({
        chains: {
          sepolia: {
            privateKey: '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          },
        },
      });

      expect((await stat(configDir)).mode & 0o777).toBe(0o700);
      expect((await stat(configPath)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
