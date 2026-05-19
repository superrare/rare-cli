import { readFile, writeFile } from 'node:fs/promises';

const SDK_INDEX_PAGES = [
  {
    path: 'docs/sdk/reference/README.md',
    title: 'SDK Reference',
    sidebarLabel: 'SDK Overview',
  },
  {
    path: 'docs/sdk/reference/index/README.md',
    title: 'Client SDK',
    sidebarLabel: 'Client',
  },
  {
    path: 'docs/sdk/reference/contracts/README.md',
    title: 'Contracts',
    sidebarLabel: 'Contracts',
  },
  {
    path: 'docs/sdk/reference/public-utils/README.md',
    title: 'Utils',
    sidebarLabel: 'Utils',
  },
] as const;

type SdkIndexPage = typeof SDK_INDEX_PAGES[number];

async function main(): Promise<void> {
  await Promise.all(SDK_INDEX_PAGES.map(addFrontmatter));
}

async function addFrontmatter(page: SdkIndexPage): Promise<void> {
  const body = await readFile(page.path, 'utf8');
  const content = body.startsWith('---\n')
    ? body.replace(/^---\n[\s\S]*?\n---\n\n?/, '')
    : body;

  await writeFile(
    page.path,
    [
      '---',
      `title: ${page.title}`,
      `sidebar_label: ${page.sidebarLabel}`,
      '---',
      '',
      content,
    ].join('\n'),
  );
}

await main();
