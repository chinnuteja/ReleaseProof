import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/coverage/**', '.tools/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }
      ]
    }
  },
  {
    files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@releaseproof/core/providers/*', '@releaseproof/core/persistence/*'], message: 'Web code must use server command/query entry points, never providers or persistence directly.' }
        ]
      }]
    }
  },
  {
    files: ['packages/core/src/domain/**/*.ts', 'packages/core/src/verification/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['next', 'next/*', '@slack/*', 'openai', 'better-sqlite3'], message: 'Pure domain and verification code cannot import framework, provider, model, or storage modules.' }
        ]
      }]
    }
  }
];
