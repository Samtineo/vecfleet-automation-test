// VEC-3363 — Llantas: filtro de fechas en listado de inspecciones (CA10 UI — loader)
// Valida que el loader (spinner) SIEMPRE cierre al presionar Buscar:
//  - con resultados
//  - con 0 resultados
//  - con error 500 del backend  <-- caso de riesgo: dataTableUpdate no tiene .catch (Arqueólogo)
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('./pages/LoginPage');

const CREDENTIALS = { username: 'stineo', password: 'susy1234' };
const GRID_PATH = '/llantainspecciones';

// Selectores (del componente LlantaInspeccionesGrid.js)
const SEL = {
  filtrosToggle: 'div[title="Filtros"]',
  fechaDesde: 'input[name="fecha_desde"]',
  fechaHasta: 'input[name="fecha_hasta"]',
  buscar: 'button.btn-primary:has-text("Buscar")',
  spinner: 'i.fa-spinner.spinner', // <Loading/> => sólo presente cuando loading===true
};

async function irAlListado(page) {
  const login = new LoginPage(page);
  await login.login(CREDENTIALS.username, CREDENTIALS.password);
  await page.goto(GRID_PATH);
  // esperar que la carga inicial termine (spinner desaparece)
  await expect(page.locator(SEL.spinner)).toHaveCount(0, { timeout: 20000 });
  // abrir el panel de filtros
  await page.locator(SEL.filtrosToggle).first().click();
  await expect(page.locator(SEL.buscar)).toBeVisible({ timeout: 10000 });
}

test.describe('VEC-3363 CA10 — loader del listado de inspecciones de llantas', () => {
  test.setTimeout(90000);

  test('Render: campos Fecha Desde/Hasta + botón Buscar visibles', async ({ page }) => {
    await irAlListado(page);
    await expect(page.locator(SEL.fechaDesde)).toBeVisible();
    await expect(page.locator(SEL.fechaHasta)).toBeVisible();
    await expect(page.locator(SEL.buscar)).toBeVisible();
  });

  test('Buscar con resultados: el loader cierra', async ({ page }) => {
    await irAlListado(page);
    await page.locator(SEL.fechaDesde).fill('2026-06-12');
    await page.locator(SEL.fechaHasta).fill('2026-06-12');
    await page.locator(SEL.buscar).click();
    // el loader debe desaparecer (no quedar pegado)
    await expect(page.locator(SEL.spinner)).toHaveCount(0, { timeout: 15000 });
    await expect(page.locator(SEL.buscar)).toBeEnabled({ timeout: 15000 });
  });

  test('Buscar con 0 resultados: el loader cierra', async ({ page }) => {
    await irAlListado(page);
    await page.locator(SEL.fechaDesde).fill('2035-01-01'); // futuro lejano => sin resultados
    await page.locator(SEL.buscar).click();
    await expect(page.locator(SEL.spinner)).toHaveCount(0, { timeout: 15000 });
    await expect(page.locator(SEL.buscar)).toBeEnabled({ timeout: 15000 });
  });

  test('Buscar con backend 500: el loader cierra igual (caso de riesgo)', async ({ page }) => {
    await irAlListado(page);
    // interceptar la llamada del listado y forzar 500
    await page.route('**/api/llantainspecciones*', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"forzado QA"}' });
      }
      return route.continue();
    });
    await page.locator(SEL.fechaDesde).fill('2026-06-12');
    await page.locator(SEL.buscar).click();
    // si el fix no cubre el path de error (sin .catch en dataTableUpdate) el loader queda pegado y este expect falla
    await expect(page.locator(SEL.spinner)).toHaveCount(0, { timeout: 15000 });
    await page.unroute('**/api/llantainspecciones*');
  });
});
