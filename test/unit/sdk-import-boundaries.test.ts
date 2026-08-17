import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const sourceRoot = join(import.meta.dirname, '../../src');

const eliminatedSdkEntrypoints = new Set([
  '@rareprotocol/rare-sdk/amounts-core',
  '@rareprotocol/rare-sdk/approvals-shell',
  '@rareprotocol/rare-sdk/auction',
  '@rareprotocol/rare-sdk/contracts/addresses',
  '@rareprotocol/rare-sdk/data-access/errors',
  '@rareprotocol/rare-sdk/data-access/schema',
  '@rareprotocol/rare-sdk/erc1155',
  '@rareprotocol/rare-sdk/liquid',
  '@rareprotocol/rare-sdk/merkle-file',
  '@rareprotocol/rare-sdk/swap',
  '@rareprotocol/rare-sdk/types/batch-listing',
  '@rareprotocol/rare-sdk/types/erc1155',
  '@rareprotocol/rare-sdk/types/release',
  '@rareprotocol/rare-sdk/validation',
  '@rareprotocol/rare-sdk/validation-core',
]);

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(path);
    return entry.isFile() && path.endsWith('.ts') ? [path] : [];
  }));
  return files.flat();
}

function sdkModuleSpecifiers(file: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

  function visit(node: ts.Node): string[] {
    let specifier: string | undefined;
    const dynamicImportArgument = ts.isCallExpression(node) ? node.arguments[0] : undefined;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifier = node.moduleSpecifier.text;
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      dynamicImportArgument !== undefined &&
      ts.isStringLiteral(dynamicImportArgument)
    ) {
      specifier = dynamicImportArgument.text;
    }
    return [
      ...(specifier === undefined ? [] : [specifier]),
      ...node.getChildren(sourceFile).flatMap(visit),
    ];
  }

  return visit(sourceFile).filter((specifier) => specifier.startsWith('@rareprotocol/rare-sdk'));
}

describe('SDK import boundaries', () => {
  it('does not reintroduce eliminated SDK deep entrypoints in production code', async () => {
    const violations = (await Promise.all((await listTypeScriptFiles(sourceRoot)).map(async (file) => {
      const source = await readFile(file, 'utf8');
      return sdkModuleSpecifiers(file, source)
        .filter((specifier) => eliminatedSdkEntrypoints.has(specifier))
        .map((specifier) => `${relative(sourceRoot, file)}: ${specifier}`);
    }))).flat();

    expect(violations).toEqual([]);
  });
});
