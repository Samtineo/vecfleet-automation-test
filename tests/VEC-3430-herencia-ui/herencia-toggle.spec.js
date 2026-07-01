const { test, expect } = require('@playwright/test');

// VEC-3430 CA08: el toggle "Herencia automática" en el ABM de Servicios
// debe verse SOLO para servicios PREVENTIVO/VENCIMIENTO y ocultarse para el resto.
// Prereq (vec-dev): config_business servicios.herenciaRepuestosManoDeObra=true y servicios.repuestos=true;
// perfil con permiso SERVICIOS_MODIFICAR_HERENCIA_ITEMS.
// Servicios de prueba existentes: 37=PREVENTIVO, 1071=VENCIMIENTO, 4=CORRECTIVO (CARTER).

const USER = 'stineo';
const PASS = 'susy1234';
const TOGGLE = /Herencia autom/i;

async function login(page) {
  await page.goto('/');
  const u = page.locator('input[name="usuario"]');
  await u.waitFor({ state: 'visible', timeout: 20000 });
  await u.fill(USER);
  await page.locator('input[name="clave"]').fill(PASS);
  await Promise.all([
    u.waitFor({ state: 'hidden', timeout: 25000 }),
    page.locator('button[type="submit"]').click(),
  ]);
}

async function openServicioEdit(page, id) {
  await page.goto(`/servicios/${id}/edit`);
  // esperar que cargue el form (label "Tipo de Ticket")
  await page.getByText(/Tipo de Ticket/i).first().waitFor({ state: 'visible', timeout: 20000 });
  // esperar a que el nombre del servicio esté poblado (form data cargada del backend)
  await expect.poll(async () => {
    return await page.locator('input[name="nombre"]').inputValue().catch(() => '');
  }, { timeout: 15000 }).not.toBe('');
  // respiro para el render condicional del toggle
  await page.waitForTimeout(2500);
}

test.describe('VEC-3430 · Herencia automática toggle por tipo de servicio', () => {
  test('PREVENTIVO (servicio 1048) → toggle VISIBLE', async ({ page }) => {
    await login(page);
    await openServicioEdit(page, 1048);
    const count = await page.getByText(TOGGLE).count();
    console.log(`[servicio 1048 PREVENTIVO] labels "Herencia automática": ${count}`);
    expect(count, 'toggle debe verse en PREVENTIVO').toBeGreaterThan(0);
  });

  test('VENCIMIENTO (servicio 1071) → toggle VISIBLE', async ({ page }) => {
    await login(page);
    await openServicioEdit(page, 1071);
    const count = await page.getByText(TOGGLE).count();
    console.log(`[servicio 1071 VENCIMIENTO] labels "Herencia automática": ${count}`);
    expect(count, 'toggle debe verse en VENCIMIENTO').toBeGreaterThan(0);
  });

  test('CORRECTIVO (servicio 4) → toggle OCULTO', async ({ page }) => {
    await login(page);
    await openServicioEdit(page, 4);
    const count = await page.getByText(TOGGLE).count();
    console.log(`[servicio 4 CORRECTIVO] labels "Herencia automática": ${count}`);
    expect(count, 'toggle NO debe verse en CORRECTIVO').toBe(0);
  });
});
