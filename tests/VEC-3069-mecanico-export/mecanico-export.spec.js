// VEC-3069 — Switch Mecánico en modal de exportación de Tickets
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('./pages/LoginPage');
const { TicketsExportPage } = require('./pages/TicketsExportPage');

const CREDENTIALS = { username: 'stineo', password: 'susy1234' };

test.describe('VEC-3069 — Switch Mecánico en exportación de Tickets', () => {
  let loginPage;
  let exportPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    exportPage = new TicketsExportPage(page);
    await loginPage.login(CREDENTIALS.username, CREDENTIALS.password);
    await exportPage.gotoTickets();
    await exportPage.abrirModalExport();
  });

  test('TC-01 | Switch "Mecánico" existe en el modal de exportación', async ({ page }) => {
    await expect(exportPage.inputMecanicoNombres).toBeAttached();
    await expect(exportPage.labelMecanico).toBeVisible();
  });

  test('TC-02 | Con "Desglose de Tareas" apagado, switch Mecánico está deshabilitado y muestra tooltip', async ({ page }) => {
    await exportPage.desactivarTareaNombre();
    await expect(exportPage.inputMecanicoNombres).toBeDisabled();
    await exportPage.hoverSwitchMecanicoDisabled();
    await expect(exportPage.tooltipMecanico).toBeVisible();
  });

  test('TC-03 | Activar "Desglose de Tareas" habilita el switch Mecánico', async ({ page }) => {
    await exportPage.desactivarTareaNombre();
    await expect(exportPage.inputMecanicoNombres).toBeDisabled();

    await exportPage.activarTareaNombre();
    await expect(exportPage.inputMecanicoNombres).toBeEnabled();
  });
});
