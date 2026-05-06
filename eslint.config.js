import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import functional from 'eslint-plugin-functional';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import localRules from './eslint-local-rules/only-parse-unknown.js';

const tsFiles = ['**/*.ts'];
const jsFiles = ['**/*.js', '**/*.mjs'];

export default defineConfig([
  {
    ignores: [
      'coverage/**',
      'dist/**',
      'node_modules/**',
      'src/data-access/schema.d.ts',
    ],
  },
  {
    files: jsFiles,
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    plugins: {
      functional,
    },
    rules: {
      ...js.configs.recommended.rules,
      'functional/no-let': ['error', { allowInForLoopInit: true }],
      'no-param-reassign': ['error', { props: true }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value="0x0000000000000000000000000000000000000000"]',
          message: 'Use viem zeroAddress directly, or a semantic constant such as ETH_ADDRESS or PUBLIC_LISTING_TARGET.',
        },
      ],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: tsFiles,
  })),
  {
    files: tsFiles,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2023,
      },
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      functional,
      local: localRules,
    },
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowDirectConstAssertionInArrowFunctions: true,
          allowHigherOrderFunctions: false,
          allowTypedFunctionExpressions: true,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': [
        'error',
        { checkLiteralConstAssertions: false },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          enableAutofixRemoval: { imports: true },
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-type-arguments': 'off',
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      'functional/immutable-data': [
        'error',
        {
          ignoreClasses: 'fieldsOnly',
          ignoreImmediateMutation: true,
          ignoreNonConstDeclarations: false,
          ignoreAccessorPattern: ['RuleTester.*'],
        },
      ],
      'functional/no-let': ['error', { allowInForLoopInit: true }],
      'local/only-parse-unknown': 'error',
      'no-param-reassign': ['error', { props: true }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression[typeAnnotation.type!="TSUnknownKeyword"][typeAnnotation.typeName.name!="const"]',
          message: 'Type assertions are disallowed except `as const` and `as unknown`.',
        },
        {
          selector: 'TSTypeAssertion',
          message: 'Type assertions are disallowed except `as const` and `as unknown`.',
        },
        {
          selector: 'Literal[value="0x0000000000000000000000000000000000000000"]',
          message: 'Use viem zeroAddress directly, or a semantic constant such as ETH_ADDRESS or PUBLIC_LISTING_TARGET.',
        },
      ],
      'no-unused-vars': 'off',
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
]);
