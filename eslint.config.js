import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import functional from 'eslint-plugin-functional';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import localRules from './eslint-local-rules/plugin.js';

const tsFiles = ['**/*.ts'];
const jsFiles = ['**/*.js', '**/*.mjs'];

/** Matches functional core / reusable modules per AGENTS.md (no direct CLI shell I/O or process.exit). */
const coreTsGlobs = [
  'src/sdk/**/*.ts',
  'src/swap/**/*.ts',
  'src/**/*-core.ts',
  'src/contracts/**/*.ts',
];

export default defineConfig([
  {
    ignores: [
      'coverage/**',
      'dist/**',
      'node_modules/**',
      'src/data-access/schema.d.ts',
      'eslint-local-rules/**/*.d.ts',
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
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-param-reassign': ['error', { props: true }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value="0x0000000000000000000000000000000000000000"]',
          message:
            'Use viem zeroAddress directly, or a semantic constant such as ETH_ADDRESS or PUBLIC_LISTING_TARGET.',
        },
      ],
      'no-useless-concat': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-template': 'error',
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
      // Off rules below are NOT permissive — each is replaced by a stricter rule:
      //   `consistent-type-assertions`     ← `no-restricted-syntax` (bans all assertions except `as const` / `as unknown`)
      //   `no-array-constructor`           ← `@typescript-eslint/no-array-constructor`
      //   `no-throw-literal`               ← `@typescript-eslint/only-throw-error`
      //   `no-unused-vars`                 ← `@typescript-eslint/no-unused-vars`
      //   `restrict-template-expressions`  ← off; viem's branded template-literal types make it noisy
      //   `no-unnecessary-type-parameters` ← off; false-positive on intentional overload-style generics
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowDirectConstAssertionInArrowFunctions: true,
          allowHigherOrderFunctions: false,
          allowTypedFunctionExpressions: true,
        },
      ],
      '@typescript-eslint/method-signature-style': ['error', 'property'],
      '@typescript-eslint/no-array-constructor': 'error',
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/no-confusing-non-null-assertion': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'error',
      '@typescript-eslint/no-duplicate-type-constituents': 'error',
      '@typescript-eslint/no-dynamic-delete': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-for-in-array': 'error',
      '@typescript-eslint/no-implied-eval': 'error',
      '@typescript-eslint/no-loop-func': 'error',
      '@typescript-eslint/no-loss-of-precision': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-redundant-type-constituents': 'error',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unnecessary-qualifier': 'error',
      '@typescript-eslint/no-unnecessary-type-arguments': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': [
        'error',
        { checkLiteralConstAssertions: false },
      ],
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
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
      '@typescript-eslint/no-useless-empty-export': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/prefer-promise-reject-errors': 'error',
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/require-array-sort-compare': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/restrict-template-expressions': 'off',
      // `error-handling-correctness-only` requires `return await` inside try/catch and around
      // `.catch()/.finally()` (so stack traces are useful), but does NOT forbid it elsewhere.
      // This avoids a hard conflict with `require-await` for pure pass-through async functions.
      '@typescript-eslint/return-await': ['error', 'error-handling-correctness-only'],
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowAny: false,
          allowNullableBoolean: true,
          allowNullableNumber: true,
          allowNullableObject: true,
          allowNullableString: true,
          allowNumber: false,
          allowString: false,
        },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/unbound-method': 'error',
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
      'array-callback-return': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
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
      'guard-for-in': 'error',
      'local/only-parse-unknown': 'error',
      'local/prefer-is-address-equal': 'error',
      'no-array-constructor': 'off',
      'no-caller': 'error',
      'no-eval': 'error',
      'no-extend-native': 'error',
      'no-iterator': 'error',
      'no-multi-str': 'error',
      'no-new-wrappers': 'error',
      'no-octal-escape': 'error',
      'no-param-reassign': ['error', { props: true }],
      'no-proto': 'error',
      'no-return-assign': 'error',
      'no-self-compare': 'error',
      'no-sequences': 'error',
      'no-throw-literal': 'off',
      'no-unmodified-loop-condition': 'error',
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',
      radix: 'error',
      'no-unused-vars': 'off',
      'no-useless-concat': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-template': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'TSAsExpression[typeAnnotation.type!="TSUnknownKeyword"][typeAnnotation.typeName.name!="const"]',
          message: 'Type assertions are disallowed except `as const` and `as unknown`.',
        },
        {
          selector: 'TSTypeAssertion',
          message: 'Type assertions are disallowed except `as const` and `as unknown`.',
        },
        {
          selector: 'Literal[value="0x0000000000000000000000000000000000000000"]',
          message:
            'Use viem zeroAddress directly, or a semantic constant such as ETH_ADDRESS or PUBLIC_LISTING_TARGET.',
        },
      ],
    },
  },
  {
    files: coreTsGlobs,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: 'commands[/\\\\]',
              message: 'SDK/core must not import CLI command modules.',
            },
            {
              group: [
                '**/output.js',
                '**/errors.js',
                '**/config.js',
                // Shell `src/client.ts` is always `../client.js` from core dirs; do not use `**/client.js`
                // (that would ban the SDK’s own `./client.js` / `sdk/client` module).
                '../client.js',
              ],
              message:
                'SDK/core must not import CLI shell modules (output, errors, config, client).',
            },
          ],
        },
      ],
      'no-console': 'error',
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'exit',
          message:
            'Core/SDK code must not call process.exit; return or throw and let the CLI shell exit.',
        },
      ],
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/method-signature-style': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/no-restricted-imports': 'off',
      '@typescript-eslint/no-shadow': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/promise-function-async': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/unbound-method': 'off',
      'functional/no-let': 'off',
      'local/prefer-is-address-equal': 'off',
      'no-console': 'off',
      'no-restricted-properties': 'off',
    },
  },
  {
    files: ['vitest.config.ts', 'tsup.config.ts'],
    rules: {
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-shadow': 'off',
    },
  },
]);
