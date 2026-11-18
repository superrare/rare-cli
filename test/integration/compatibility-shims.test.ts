import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('published package subpath exports', () => {
  it('marks each generated compatibility declaration as deprecated', async () => {
    const entries = ['client', 'contracts', 'utils'] as const;
    const declarations = await Promise.all(entries.map(async (entry) => ({
      entry,
      declaration: await readFile(`dist/${entry}.d.ts`, 'utf8'),
    })));

    for (const { entry, declaration } of declarations) {
      const expectedDeclarationStart = [
        `/** @deprecated Import from \`@rareprotocol/rare-sdk/${entry}\` instead. */`,
        `export * from '@rareprotocol/rare-sdk/${entry}';`,
      ].join('\n');
      expect(declaration.slice(0, expectedDeclarationStart.length)).toBe(expectedDeclarationStart);
    }
  });

  it('loads the built client, contracts, and utils subpaths through package exports', async () => {
    const client = await import('@rareprotocol/rare-cli/client');
    const contracts = await import('@rareprotocol/rare-cli/contracts');
    const utils = await import('@rareprotocol/rare-cli/utils');

    expect(client).toHaveProperty('createRareClient');
    expect(client).toHaveProperty('ApprovalSideEffectError');
    expect(contracts).toHaveProperty('getContractAddresses');
    expect(contracts).toHaveProperty('getRareBridgeAddress');
    expect(contracts).toHaveProperty('getCcipChainSelector');
    expect(contracts).toHaveProperty('liquidRouterAbi');
    expect(contracts).toHaveProperty('rareBridgeAbi');
    expect(utils).toHaveProperty('buildUtilsTree');
    expect(utils).toHaveProperty('verifyUtilsTreeProof');
  });
});
