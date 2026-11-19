import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{shared,server,client,tools}/src/**/*.test.ts'],
  },
});
