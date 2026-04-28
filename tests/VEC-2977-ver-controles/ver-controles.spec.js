// VEC-2977 — Visualización de próximos mantenimientos desde el ticket
const { test, expect, request } = require('@playwright/test');
const { LoginPage } = require('./pages/LoginPage');
const { TicketPage } = require('./pages/TicketPage');

const CREDENTIALS = { username: 'stineo', password: 'susy1234' };
const API_BASE = 'https://vec-dev.vecfleet.io/ws/Public/index.php/api';
const API_TOKEN = 'c91e041448c93ab2';
const STINEO_PERSONA_ID = 27;

// Perfiles QA creados en vec-dev
const PERFILES = {
  original:          719,  // ADMINISTRADOR VF - SOLE (ambos permisos)
  soloVencimientos:  731,  // QA-TEST - Solo Vencimientos Movil (sin PREVENTIVOS_MOVIL_LISTAR)
  soloPreventivos:   732,  // QA-TEST - Solo Preventivos Movil (sin VENCIMIENTOS_MOVIL_LISTAR)
  sinControles:      733,  // QA-TEST - Sin Controles Movil (sin ninguno)
};

// Tickets en vec-dev
// #14  → ABIERTO, PREVENTIVO, movil_id=1 (CCU7B11) — 7 preventivos, 4 vencimientos
// #93  → ABIERTO, PREVENTIVO, movil_id=10           — 0 preventivos, 0 vencimientos
// #179 → ABIERTO, PREVENTIVO, movil_id=7            — 1 preventivo,  0 vencimientos
// #1   → CERRADO, PREVENTIVO, movil_id=1

async function cambiarPerfil(perfilId) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ perfil_id: perfilId });
    const opts = {
      hostname: 'vec-dev.vecfleet.io',
      path: `/ws/Public/index.php/api/personas/${STINEO_PERSONA_ID}/cambiar-perfil`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization-Token': API_TOKEN,
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

test.describe('VEC-2977 — Ver Controles desde ticket', () => {
  let loginPage;
  let ticketPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    ticketPage = new TicketPage(page);
    await loginPage.login(CREDENTIALS.username, CREDENTIALS.password);
  });

  // ── Bloque A: usuario con AMBOS permisos (perfil original) ─────────────────

  test('TC-01 | Botón Ver Controles visible en ticket CON unidad', async ({ page }) => {
    await ticketPage.gotoTicket(14);
    await expect(ticketPage.btnVerControles).toBeVisible();
  });

  test('TC-03 | Modal se abre al clickear botón', async ({ page }) => {
    await ticketPage.gotoTicket(14);
    await ticketPage.abrirModal();
    await expect(ticketPage.modal).toBeVisible();
    await expect(ticketPage.modalTitle).toContainText('Ver Controles');
  });

  test('TC-03b | Tab Preventivos activo por defecto al abrir modal', async ({ page }) => {
    await ticketPage.gotoTicket(14);
    await ticketPage.abrirModal();
    await expect(ticketPage.tabPreventivos).toHaveClass(/active/);
  });

  test('TC-04 | Tab Preventivos tiene columnas correctas', async ({ page }) => {
    await ticketPage.gotoTicket(14);
    await ticketPage.abrirModal();
    const headers = await ticketPage.getHeadersPreventivos();
    expect(headers).toContain('Servicio');
    expect(headers).toContain('Medidor al Alta');
    expect(headers).toContain('Realizar');
    expect(headers).toContain('Repetir');
    expect(headers).toContain('Alertar');
  });

  test('TC-05 | Tab Preventivos muestra 7 registros (movil_id=1)', async ({ page }) => {
    await ticketPage.gotoTicket(14);
    await ticketPage.abrirModal();
    const filas = await ticketPage.getFilasPreventivos();
    expect(filas.length).toBe(7);
  });

  test('TC-06 | Tab Vencimientos tiene columnas correctas', async ({ page }) => {
    await ticketPage.gotoTicket(14);
    await ticketPage.abrirModal();
    await ticketPage.tabVencimientos.click();
    await page.waitForTimeout(500);
    const headers = await ticketPage.getHeadersVencimientos();
    expect(headers).toContain('Fecha de Alta');
    expect(headers).toContain('Fecha de Vencimiento');
    expect(headers).toContain('Servicio');
  });

  test('TC-07 | Tab Vencimientos muestra 4 registros (movil_id=1)', async ({ page }) => {
    await ticketPage.gotoTicket(14);
    await ticketPage.abrirModal();
    await ticketPage.tabVencimientos.click();
    await page.waitForTimeout(500);
    const filas = await ticketPage.getFilasVencimientos();
    expect(filas.length).toBe(4);
  });

  test('TC-08 | Estado vacío en Preventivos (movil sin preventivos)', async ({ page }) => {
    await ticketPage.gotoTicket(93);
    await ticketPage.abrirModal();
    await expect(ticketPage.msgSinPreventivos).toBeVisible();
  });

  test('TC-09 | Estado vacío en Vencimientos (movil sin vencimientos)', async ({ page }) => {
    await ticketPage.gotoTicket(179);
    await ticketPage.abrirModal();
    await ticketPage.tabVencimientos.click();
    await page.waitForTimeout(500);
    await expect(ticketPage.msgSinVencimientos).toBeVisible();
  });

  test('TC-10 | Cerrar y reabrir modal recarga datos', async ({ page }) => {
    await ticketPage.gotoTicket(14);
    await ticketPage.abrirModal();
    await expect(ticketPage.modal).toBeVisible();
    await ticketPage.cerrarModal();
    await expect(ticketPage.modal).toBeHidden();
    await ticketPage.abrirModal();
    await expect(ticketPage.modal).toBeVisible();
    const filas = await ticketPage.getFilasPreventivos();
    expect(filas.length).toBe(7);
  });

  test('TC-14 | Botón visible en ticket CERRADO con unidad', async ({ page }) => {
    await ticketPage.gotoTicket(1);
    await expect(ticketPage.btnVerControles).toBeVisible();
  });

  // ── Bloque B: permisos parciales — swap de perfil vía API ──────────────────

  test('TC-11 | Solo VENCIMIENTOS_MOVIL_LISTAR: tab Preventivos oculto, Vencimientos visible y activo por defecto', async ({ page }) => {
    await cambiarPerfil(PERFILES.soloVencimientos);
    try {
      // Logout + re-login para que el nuevo perfil sea cargado en sesión
      await page.goto('/salir');
      await loginPage.login(CREDENTIALS.username, CREDENTIALS.password);
      await ticketPage.gotoTicket(14);
      await ticketPage.abrirModal();
      await expect(ticketPage.tabPreventivos).not.toBeVisible();
      await expect(ticketPage.tabVencimientos).toBeVisible();
      await expect(ticketPage.tabVencimientos).toHaveClass(/active/);
    } finally {
      await cambiarPerfil(PERFILES.original);
    }
  });

  test('TC-12 | Solo PREVENTIVOS_MOVIL_LISTAR: tab Vencimientos oculto, Preventivos visible y activo por defecto', async ({ page }) => {
    await cambiarPerfil(PERFILES.soloPreventivos);
    try {
      await page.goto('/salir');
      await loginPage.login(CREDENTIALS.username, CREDENTIALS.password);
      await ticketPage.gotoTicket(14);
      await ticketPage.abrirModal();
      await expect(ticketPage.tabVencimientos).not.toBeVisible();
      await expect(ticketPage.tabPreventivos).toBeVisible();
      await expect(ticketPage.tabPreventivos).toHaveClass(/active/);
    } finally {
      await cambiarPerfil(PERFILES.original);
    }
  });

  test('TC-13 | Sin ningún permiso de controles: botón Ver Controles NO visible', async ({ page }) => {
    await cambiarPerfil(PERFILES.sinControles);
    try {
      await page.goto('/salir');
      await loginPage.login(CREDENTIALS.username, CREDENTIALS.password);
      await ticketPage.gotoTicket(14);
      await expect(ticketPage.btnVerControles).not.toBeVisible();
    } finally {
      await cambiarPerfil(PERFILES.original);
    }
  });
});
