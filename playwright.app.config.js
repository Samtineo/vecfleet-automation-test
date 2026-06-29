// @ts-check
// Config dedicada para E2E de la APP móvil (Quasar SPA en quasar dev → localhost:9000)
// apuntada al backend de teco-test. Separada de playwright.config.js (que apunta a la web vec-dev).
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/VEC-3270-3274-app-presupuesto',
  testMatch: '**/*.spec.js',
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:9000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
    trace: 'off',
    viewport: { width: 390, height: 844 }, // tamaño tipo móvil
    // teco-test no envía headers CORS; en device nativo (Capacitor) no aplica CORS.
    // Para el E2E en browser desactivamos web-security (estándar para backend sin CORS).
    launchOptions: {
      args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
