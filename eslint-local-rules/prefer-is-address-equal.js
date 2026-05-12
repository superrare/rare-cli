import { ESLintUtils, AST_NODE_TYPES } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (ruleName) => `https://github.com/superrare/rare-cli/tree/main/eslint-local-rules/${ruleName}`,
);

/** Types that represent a checksummed / hex address from viem (abitype). */
function isLikelyEvmAddressType(checker, type) {
  if (type.isUnion()) {
    return type.types.some((member) => isLikelyEvmAddressType(checker, member));
  }

  const alias = type.aliasSymbol;
  if (alias && alias.escapedName === 'Address') {
    return true;
  }

  const str = checker.typeToString(type);
  return str === 'Address' || str === '`0x${string}`';
}

export const preferIsAddressEqual = createRule({
  name: 'prefer-is-address-equal',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer viem `isAddressEqual` instead of lowercasing addresses for comparison.',
    },
    messages: {
      useIsAddressEqual:
        'Compare addresses with viem `isAddressEqual(a, b)` instead of `.toLowerCase()` (checksum-safe, clearer intent).',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    return {
      CallExpression(node) {
        if (node.arguments.length !== 0) {
          return;
        }

        const { callee } = node;
        if (
          callee.type !== AST_NODE_TYPES.MemberExpression ||
          callee.computed ||
          callee.property.type !== AST_NODE_TYPES.Identifier ||
          callee.property.name !== 'toLowerCase'
        ) {
          return;
        }

        const tsObject = services.esTreeNodeToTSNodeMap.get(callee.object);
        const objectType = checker.getTypeAtLocation(tsObject);

        if (!isLikelyEvmAddressType(checker, objectType)) {
          return;
        }

        context.report({ node, messageId: 'useIsAddressEqual' });
      },
    };
  },
});

export default {
  rules: {
    'prefer-is-address-equal': preferIsAddressEqual,
  },
};
