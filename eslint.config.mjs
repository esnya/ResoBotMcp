import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'coverage'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        // Types-aware lint without hard-coding project path
        projectService: true,
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommendedTypeChecked.rules,
      ...tseslint.configs.stylisticTypeChecked.rules,

      // Disable base rule in favor of TS-aware version
      'no-unused-vars': 'off',

      // Stricter TS rules
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],

      // JS hygiene
      // Production code must not use console (stderr-only via pino allowed).
      'no-console': ['error', { allow: ['error'] }],
      // Empty blocks are forbidden, including empty catch.
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-implicit-coercion': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message: 'Use union string/number literal types instead of enums.',
        },
        // Do not use default parameters; require explicit values at call sites.
        {
          selector: 'FunctionDeclaration > AssignmentPattern',
          message:
            'Default parameters are prohibited by policy. Require explicit arguments and handle absence explicitly.',
        },
        {
          selector: 'FunctionExpression > AssignmentPattern',
          message:
            'Default parameters are prohibited by policy. Require explicit arguments and handle absence explicitly.',
        },
        {
          selector: 'ArrowFunctionExpression > AssignmentPattern',
          message:
            'Default parameters are prohibited by policy. Require explicit arguments and handle absence explicitly.',
        },
      ],
    },
  },
  {
    // Test files are looser
    files: ['**/*.test.ts', '**/__tests__/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Devtools can log freely; not part of protocol transports
    files: ['src/devtools/**/*.ts'],
    rules: {
      'no-console': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    ignores: ['vitest.config.ts'],
  },
  // Disable formatting-related lint rules; delegate to Prettier
  eslintConfigPrettier,
);
