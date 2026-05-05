// VEC-3058 — Mantener selección y Marcar/Desmarcar todo en modal de exportación (Móviles + Tickets)
const { test, expect } = require('@playwright/test');
const { LoginPage }      = require('./pages/LoginPage');
const { ExportModalPage } = require('./pages/ExportModalPage');

const CREDENTIALS = { username: 'stineo', password: 'susy1234' };
const LS_MOVILES  = 'MovilesGridSeleccionExport';
const LS_TICKETS  = 'TicketsGridSeleccionExport';

// ── Móviles ──────────────────────────────────────────────────────────────────

test.describe('VEC-3058 — Modal exportación Móviles', () => {
  let loginPage, exportPage;

  test.beforeEach(async ({ page }) => {
    loginPage  = new LoginPage(page);
    exportPage = new ExportModalPage(page);
    await loginPage.login(CREDENTIALS.username, CREDENTIALS.password);
    await exportPage.clearStorage(LS_MOVILES);
    await exportPage.gotoMoviles();
    await exportPage.abrirModalMoviles();
  });

  test('TC-01 | "Mantener Selección" es visible en el modal', async () => {
    await expect(exportPage.switchMantener).toBeVisible();
  });

  test('TC-02 | "Marcar / Desmarcar todo" es visible en el modal', async () => {
    await expect(exportPage.switchToggleAll).toBeVisible();
  });

  test('TC-03 | "Marcar todo" selecciona todas las columnas visibles', async ({ page }) => {
    await exportPage.marcarTodo();

    const allChecked = await page.evaluate(() => {
      var modal = document.querySelector('#export_modal');
      return Array.from(modal.querySelectorAll('[role="checkbox"]'))
        .every(el => el.getAttribute('aria-checked') === 'true');
    });
    expect(allChecked).toBe(true);
  });

  test('TC-04 | "Desmarcar todo" desmarca todas las columnas', async ({ page }) => {
    await exportPage.marcarTodo();
    await exportPage.desmarcarTodo();

    const allUnchecked = await page.evaluate(() => {
      var modal = document.querySelector('#export_modal');
      // Excluir el switch de control Marcar/Desmarcar (puede quedar en false correctamente)
      return Array.from(modal.querySelectorAll('[role="checkbox"]'))
        .filter(el => {
          var lbl = el.closest('div') && el.closest('div').querySelector('label');
          var forAttr = lbl && lbl.getAttribute('for');
          return forAttr !== 'marcarDesmarcarTodo' && forAttr !== 'persisteSeleccionExport';
        })
        .every(el => el.getAttribute('aria-checked') === 'false');
    });
    expect(allUnchecked).toBe(true);
  });

  test('TC-05 | "Mantener Selección" ON — reabrir modal restaura la selección guardada', async ({ page }) => {
    await exportPage.activarMantener();
    await exportPage.desmarcarTodo(); // estado distinto al default

    const countAntes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#export_modal [role="checkbox"]'))
        .filter(el => el.getAttribute('aria-checked') === 'true').length
    );

    await exportPage.cerrarModal();
    await exportPage.abrirModalMoviles();

    const countDespues = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#export_modal [role="checkbox"]'))
        .filter(el => el.getAttribute('aria-checked') === 'true').length
    );

    expect(countDespues).toBe(countAntes);
  });

  test('TC-06 | "Mantener Selección" OFF — reabrir modal muestra selección por defecto', async () => {
    await exportPage.desactivarMantener();
    await exportPage.cerrarModal();
    await exportPage.abrirModalMoviles();

    const storage = await exportPage.getStorage(LS_MOVILES);
    expect(!storage || storage.activo !== true).toBe(true);
  });

  test('TC-07 | "Marcar todo" no habilita columnas ocultas por configuración', async ({ page }) => {
    const visibleIds = await exportPage.getVisibleColumnIds();
    await exportPage.activarMantener();
    await exportPage.marcarTodo();

    const storage = await exportPage.getStorage(LS_MOVILES);
    if (!storage || !storage.dataToExport) return;

    const hiddenHabilitadas = Object.keys(storage.dataToExport)
      .filter(k => storage.dataToExport[k] === true && !visibleIds.includes(k));

    expect(hiddenHabilitadas).toHaveLength(0);
  });
});

// ── Tickets ───────────────────────────────────────────────────────────────────

test.describe('VEC-3058 — Modal exportación Tickets', () => {
  let loginPage, exportPage;

  test.beforeEach(async ({ page }) => {
    loginPage  = new LoginPage(page);
    exportPage = new ExportModalPage(page);
    await loginPage.login(CREDENTIALS.username, CREDENTIALS.password);
    await exportPage.clearStorage(LS_TICKETS);
    await exportPage.gotoTickets();
    await exportPage.abrirModalTickets();
  });

  test('TC-08 | "Mantener Selección" es visible en el modal', async () => {
    await expect(exportPage.switchMantener).toBeVisible();
  });

  test('TC-09 | "Marcar / Desmarcar todo" es visible en el modal', async () => {
    await expect(exportPage.switchToggleAll).toBeVisible();
  });

  test('TC-10 | "Marcar todo" selecciona todas las columnas visibles', async ({ page }) => {
    await exportPage.marcarTodo();

    const allChecked = await page.evaluate(() => {
      var modal = document.querySelector('#export_modal');
      return Array.from(modal.querySelectorAll('[role="checkbox"]'))
        .every(el => el.getAttribute('aria-checked') === 'true');
    });
    expect(allChecked).toBe(true);
  });

  test('TC-11 | "Mantener Selección" ON — reabrir modal restaura la selección guardada', async ({ page }) => {
    await exportPage.activarMantener();
    await exportPage.desmarcarTodo();

    const countAntes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#export_modal [role="checkbox"]'))
        .filter(el => el.getAttribute('aria-checked') === 'true').length
    );

    await exportPage.cerrarModal();
    await exportPage.abrirModalTickets();

    const countDespues = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#export_modal [role="checkbox"]'))
        .filter(el => el.getAttribute('aria-checked') === 'true').length
    );

    expect(countDespues).toBe(countAntes);
  });
});
