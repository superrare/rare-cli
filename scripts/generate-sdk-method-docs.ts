import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const OUTPUT_PATH = resolve('docs/sdk/client-methods.md');
const TYPE_SOURCE_PATH = resolve('src/sdk/types/client.ts');
const TYPE_NAME = 'RareClient';
const CLIENT_NAME = 'rare';
const MAX_DEPTH = 8;
const CLIENT_NAMESPACE_NAMES = new Set([
  'auction',
  'bridge',
  'collection',
  'currency',
  'import',
  'liquidEdition',
  'listing',
  'media',
  'nft',
  'offer',
  'search',
  'swap',
  'token',
  'user',
  'utils',
]);
const NON_TRAVERSABLE_SYMBOL_NAMES = new Set([
  'Array',
  'ReadonlyArray',
  'Promise',
  'String',
  'Number',
  'Boolean',
  'BigInt',
  'Date',
  'Uint8Array',
]);
const NON_TRAVERSABLE_FLAGS =
  ts.TypeFlags.Any |
  ts.TypeFlags.Unknown |
  ts.TypeFlags.StringLike |
  ts.TypeFlags.NumberLike |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.BigIntLike |
  ts.TypeFlags.ESSymbolLike |
  ts.TypeFlags.Void |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Null |
  ts.TypeFlags.Never;
const TYPE_FORMAT_FLAGS =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType |
  ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;

type MethodDoc = {
  path: string;
  signature: string;
  summary: string;
};

async function main(): Promise<void> {
  const { checker, sourceFile, typeNode } = createTypeContext();
  const rareClientType = checker.getTypeFromTypeNode(typeNode);
  const methods = collectClientNamespaceMethods({
    checker,
    location: typeNode,
    type: rareClientType,
  });

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, renderMethodDocs(methods));
  void sourceFile;
}

function createTypeContext(): {
  checker: ts.TypeChecker;
  sourceFile: ts.SourceFile;
  typeNode: ts.TypeNode;
} {
  const configPath = ts.findConfigFile(process.cwd(), (filePath) => ts.sys.fileExists(filePath), 'tsconfig.json');
  if (configPath === undefined) {
    throw new Error('Unable to find tsconfig.json.');
  }

  const rawConfig = ts.readConfigFile(configPath, (filePath) => ts.sys.readFile(filePath));
  if (rawConfig.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(rawConfig.error.messageText, '\n'));
  }

  const parsedConfig = ts.parseJsonConfigFileContent(rawConfig.config, ts.sys, dirname(configPath));
  const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
  const sourceFile = program.getSourceFile(TYPE_SOURCE_PATH);
  if (sourceFile === undefined) {
    throw new Error(`Unable to load ${TYPE_SOURCE_PATH}.`);
  }

  const typeAlias = sourceFile.statements.find(isRareClientTypeAlias);
  if (typeAlias === undefined) {
    throw new Error(`Unable to find ${TYPE_NAME} type alias.`);
  }

  return {
    checker: program.getTypeChecker(),
    sourceFile,
    typeNode: typeAlias.type,
  };
}

function isRareClientTypeAlias(node: ts.Statement): node is ts.TypeAliasDeclaration {
  return ts.isTypeAliasDeclaration(node) && node.name.text === TYPE_NAME;
}

function collectClientNamespaceMethods(options: {
  checker: ts.TypeChecker;
  location: ts.Node;
  type: ts.Type;
}): MethodDoc[] {
  return options.type.getProperties().flatMap((property) => {
    const propertyName = property.getName();
    if (!CLIENT_NAMESPACE_NAMES.has(propertyName)) {
      return [];
    }

    const declaration = getFirstDeclaration(property);
    if (declaration === undefined) {
      return [];
    }

    const propertyType = options.checker.getTypeOfSymbolAtLocation(property, declaration);
    return collectMethods({
      checker: options.checker,
      location: declaration,
      path: [CLIENT_NAME, propertyName],
      seen: new Set(),
      type: propertyType,
    });
  });
}

function collectMethods(options: {
  checker: ts.TypeChecker;
  location: ts.Node;
  path: readonly string[];
  seen: ReadonlySet<ts.Type>;
  type: ts.Type;
}): MethodDoc[] {
  const signatures = options.type.getCallSignatures();
  if (signatures.length > 0) {
    const [signature] = signatures;
    if (signature === undefined) {
      return [];
    }

    return [renderMethod(signature, options)];
  }

  if (options.path.length > MAX_DEPTH || options.seen.has(options.type)) {
    return [];
  }

  const nextSeen = new Set([...options.seen, options.type]);

  return options.type.getProperties().flatMap((property) => {
    const declaration = getFirstDeclaration(property);
    if (declaration === undefined) {
      return [];
    }

    const propertyType = options.checker.getTypeOfSymbolAtLocation(property, declaration);
    if (!isTraversableType(propertyType)) {
      return [];
    }

    return collectMethods({
      checker: options.checker,
      location: declaration,
      path: [...options.path, property.getName()],
      seen: nextSeen,
      type: propertyType,
    });
  });
}

function isTraversableType(type: ts.Type): boolean {
  if (type.getCallSignatures().length > 0) {
    return true;
  }

  if (type.isUnion()) {
    return type.types.some(isTraversableType);
  }

  if ((type.flags & NON_TRAVERSABLE_FLAGS) !== 0) {
    return false;
  }

  const symbolName = type.getSymbol()?.getName();
  if (symbolName !== undefined && NON_TRAVERSABLE_SYMBOL_NAMES.has(symbolName)) {
    return false;
  }

  return type.getProperties().length > 0;
}

function renderMethod(
  signature: ts.Signature,
  options: {
    checker: ts.TypeChecker;
    location: ts.Node;
    path: readonly string[];
  },
): MethodDoc {
  return {
    path: options.path.join('.'),
    signature: renderSignature(signature, options.checker, options.location),
    summary: getSummary(signature, options.checker),
  };
}

function renderSignature(
  signature: ts.Signature,
  checker: ts.TypeChecker,
  location: ts.Node,
): string {
  const parameters = signature.getParameters()
    .map((parameter) => renderParameter(parameter, checker, location))
    .join(', ');
  const returnType = checker.typeToString(signature.getReturnType(), location, TYPE_FORMAT_FLAGS);

  return `(${parameters}) => ${returnType}`;
}

function renderParameter(
  parameter: ts.Symbol,
  checker: ts.TypeChecker,
  fallbackLocation: ts.Node,
): string {
  const declaration = getFirstDeclaration(parameter);
  const location = declaration ?? fallbackLocation;
  const optional = declaration !== undefined && ts.isParameter(declaration) && declaration.questionToken !== undefined
    ? '?'
    : '';
  const parameterType = checker.getTypeOfSymbolAtLocation(parameter, location);

  return `${parameter.getName()}${optional}: ${checker.typeToString(parameterType, location, TYPE_FORMAT_FLAGS)}`;
}

function getSummary(signature: ts.Signature, checker: ts.TypeChecker): string {
  return ts.displayPartsToString(signature.getDocumentationComment(checker))
    .replaceAll('\n', ' ')
    .trim();
}

function getFirstDeclaration(symbol: ts.Symbol): ts.Declaration | undefined {
  const declarations = symbol.getDeclarations();
  if (declarations === undefined) {
    return undefined;
  }

  const [declaration] = declarations;
  return declaration;
}

function renderMethodDocs(methods: readonly MethodDoc[]): string {
  const sortedMethods = [...methods].sort((left, right) => left.path.localeCompare(right.path));
  const namespaces = [...new Set(sortedMethods.map(getNamespace))];

  return [
    '---',
    'title: SDK Client Methods',
    'sidebar_label: Client Methods',
    '---',
    '',
    '# SDK Client Methods',
    '',
    '<!-- This file is generated by `npm run docs:generate`. Do not edit it directly. -->',
    '',
    'This page lists the callable methods on the object returned by `createRareClient`.',
    '',
    ...namespaces.flatMap((namespace) => renderNamespace(namespace, sortedMethods)),
  ].join('\n');
}

function renderNamespace(namespace: string, methods: readonly MethodDoc[]): string[] {
  const rows = methods
    .filter((method) => getNamespace(method) === namespace)
    .map(renderMethodRow);

  return [
    `## ${namespace}`,
    '',
    '| Method | Signature | Summary |',
    '| --- | --- | --- |',
    ...rows,
    '',
  ];
}

function renderMethodRow(method: MethodDoc): string {
  return `| <code>${escapeHtml(method.path)}</code> | <code>${escapeHtml(escapeTableCell(method.signature))}</code> | ${escapeTableCell(method.summary)} |`;
}

function getNamespace(method: MethodDoc): string {
  const [, namespace] = method.path.split('.');
  return namespace === undefined ? method.path : `${CLIENT_NAME}.${namespace}`;
}

function escapeTableCell(value: string): string {
  return value
    .replaceAll('\n', ' ')
    .replaceAll('|', '\\|');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('`', '&#96;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;');
}

await main();
