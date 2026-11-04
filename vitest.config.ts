import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/contract/**/*.test.ts', 'ui/src/**/*.test.ts'],
    environment: 'jsdom',
  },
});
