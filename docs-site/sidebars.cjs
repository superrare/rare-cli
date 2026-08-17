/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    'intro',
    {
      type: 'category',
      label: 'CLI',
      items: [
        'cli/reference',
        'compatibility-shims',
      ],
    },
  ],
};

module.exports = sidebars;
