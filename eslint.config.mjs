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
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],

      // JS hygiene
      'no-console': ['warn', { allow: ['error'] }],
      'no-implicit-coercion': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message: 'Use union string/number literal types instead of enums.',
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
