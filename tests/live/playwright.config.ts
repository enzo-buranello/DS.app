import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  workers: 1,
  timeout: 5 * 60 * 60_000,
  reporter: 'list',
});
