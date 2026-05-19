const path = require('node:path');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'RARE Protocol CLI',
  tagline: 'CLI and SDK documentation for the RARE protocol tooling.',
  url: 'http://localhost',
  baseUrl: '/',
  organizationName: 'superrare',
  projectName: 'rare-cli',
  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },
  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          path: path.join(__dirname, '../docs'),
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.cjs'),
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],
  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'RARE Protocol CLI',
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'docs',
            position: 'left',
            label: 'Docs',
          },
          {
            href: 'https://github.com/superrare/rare-cli',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        copyright: `Copyright © ${new Date().getFullYear()} SuperRare Labs.`,
      },
    }),
};

module.exports = config;
