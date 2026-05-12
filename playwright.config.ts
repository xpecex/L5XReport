import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '__TEST',
  testMatch: '**/*.test.js',
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
});
