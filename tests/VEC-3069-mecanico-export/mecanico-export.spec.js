// VEC-3069 — Exportación de Tickets: validación genérica del modal y descarga
const { test, expect } = require('@playwright/test');
const path   = require('path');
const fs     = require('fs');
const XLSX   = require('../../node_modules/xlsx/xlsx.js');
const { LoginPage }        = require('./pages/LoginPage');
const { TicketsExportPage } = require('./pages/TicketsExportPage');

const CREDENTIALS = { username: 'stineo', password: 'susy1234' };

function parseExcelHeaders(filePath) {
  const workbook  = XLSX.readFile(filePath);
  const sheet     = workbook.Sheets[workbook.SheetNames[0]];
  const rows      = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  return rows[0] || [];
}

test.describe('VEC-3069 — Modal de exportación de Tickets', () => {
  let loginPage;
  let exportPage;

  test.beforeEach(async ({ page }) => {
    loginPage  = new LoginPage(page);
    exportPage = new TicketsExportPage(page);
    await loginPage.login(CREDENTIALS.username, CREDENTIALS.password);
    await exportPage.gotoTickets();
    await exportPage.abrirModalExport();
  });

  test('TC-01 | Modal de exportación abre desde el grid de Tickets', async () => {
    await expect(exportPage.modal).toBeVisible();
    await expect(exportPage.seccionColumnas).toBeVisible();
  });

  test('TC-02 | Export con columnas seleccionadas descarga un archivo válido', async ({ page }, testInfo) => {
    const download = await exportPage.exportarYDescargar();
    const filePath = path.join(testInfo.outputDir, download.suggestedFilename());
    await download.saveAs(filePath);

    const stats = fs.statSync(filePath);
    expect(stats.size).toBeGreaterThan(0);
  });

  test('TC-03 | Columnas habilitadas en el modal aparecen en el Excel', async ({ page }, testInfo) => {
    await exportPage.desmarcarTodo();
    await exportPage.setSwitchState('id', true);
    await exportPage.setSwitchState('movilDominio', true);

    const download = await exportPage.exportarYDescargar();
    const filePath = path.join(testInfo.outputDir, download.suggestedFilename());
    await download.saveAs(filePath);

    const headers = parseExcelHeaders(filePath);
    expect(headers).toContain('Nro. Ticket');
    expect(headers).toContain('Movil');
  });

  test('TC-04 | Columna deshabilitada en el modal no aparece en el Excel', async ({ page }, testInfo) => {
    await exportPage.desmarcarTodo();
    await exportPage.setSwitchState('id', true);

    const download = await exportPage.exportarYDescargar();
    const filePath = path.join(testInfo.outputDir, download.suggestedFilename());
    await download.saveAs(filePath);

    const headers = parseExcelHeaders(filePath);
    expect(headers).toContain('Nro. Ticket');
    expect(headers).not.toContain('Movil');
  });
});
