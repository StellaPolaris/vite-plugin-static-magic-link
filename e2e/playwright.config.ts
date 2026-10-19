import { defineConfig, devices } from '@playwright/test'

// Test-only key for the fixture build. Never use it for a real site.
export const TEST_KEY = 'pB4DbwA_wwngm4TwmDMaZ-WzM94hbsYAbs_vgK4PfYw'

export default defineConfig({
  testDir: '.',
  use: { baseURL: 'http://localhost:4173' },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    cwd: '../examples/greeting-site',
    env: { MAGIC_LINK_KEY: TEST_KEY },
    url: 'http://localhost:4173',
    reuseExistingServer: false,
  },
})
