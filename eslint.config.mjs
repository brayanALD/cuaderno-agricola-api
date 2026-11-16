import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  globalIgnores(['.claude/**', '.next/**', 'coverage/**', 'scaffold-tmp/**', 'next-env.d.ts']),
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      complexity: ['error', 10],
      'max-lines-per-function': ['error', 50],
      'max-depth': ['error', 3],
      'max-lines': ['error', 300],
      'no-console': 'error',
      eqeqeq: 'error',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
    },
  },
  {
    files: ['__tests__/**/*.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },
]);
