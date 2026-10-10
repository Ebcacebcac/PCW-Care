import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'release/**', 'node_modules/**', 'screenshots-dev/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/main/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.{js,mjs,cjs}', '*.mjs', '*.mts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // The preload runs sandboxed: it may only import 'electron'.
    files: ['src/main/preload.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [{ group: ['./*', '../*'], allowTypeImports: true, message: 'Sandboxed preload: only electron and type-only imports.' }] },
      ],
    },
  },
  {
    files: ['scripts/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-control-regex': 'off',
    },
  },
);
