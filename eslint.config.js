import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'framework/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'public/zip.js'] },
  ...tseslint.configs.recommended,
  {
    // Module code reaches data only through ModuleContext: types from @sync/modules and nothing else from @sync/*.
    files: ['modules/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [
        { group: ['@sync/core', '@sync/core/*', '@sync/spaces', '@sync/spaces/*', '@sync/blobs', '@sync/blobs/*', '@sync/identity-invite', '@sync/transport-*', '@sync/relay-server', '@sync/testkit', '@sync/app-build'], message: 'Modules get data through ModuleContext; import only types from @sync/modules.' },
        { regex: '^@sync/modules$', allowTypeImports: true, message: 'Import only types from @sync/modules.' },
      ] }],
    },
  },
  {
    // The Svelte UI never touches framework internals; it talks to the thin api passed to mount().
    files: ['ui/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [{ group: ['@sync/*'], message: 'The UI uses the api object handed to mount(), not framework packages.' }] }],
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
