// VEC-2969 — Vinculación de activos: capa UI
// Cubre VEC-3027 (visualización en ficha + grilla) y VEC-3020 (gestión manual)
const { test, expect } = require('@playwright/test');
const { LoginPage }      = require('../VEC-3058-export-modal/pages/LoginPage');
const { VinculacionPage } = require('./pages/VinculacionPage');

const BASE     = 'https://vec-dev.vecfleet.io';
const API_BASE = `${BASE}/ws/Public/index.php/api`;
const CREDS    = { username: 'stineo', password: 'susy1234' };

// IDs resueltos en beforeAll vía API
let token;
let principalId;   // tiene relación activa preparada
let asociadoId;    // activo vinculado al principal
let libreId;       // activo sin relaciones (para TC-02 y TC-07)
let relacionId;    // relación activa creada en beforeAll
let asociadoLabel; // label visible en UI del activo asociado

// ── Helpers API ───────────────────────────────────────────────────────────────

function authHeaders(t) {
  return { 'Content-Type': 'application/json', 'Authorization-Token': t };
}

async function apiLogin(request) {
  const res = await request.post(`${API_BASE}/public/auth/login`, {
    data: { usuario: CREDS.username, clave: CREDS.password },
    headers: { 'Content-Type': 'application/json' },
  });
  return (await res.json()).usuario.token;
}

async function closeSilently(request, id, t) {
  if (!id) return;
  await request.patch(`${API_BASE}/movil-relaciones/${id}/cerrar`, {
    data: { fecha_hora_fin: '2026-05-02 00:00:00' },
    headers: authHeaders(t),
  }).catch(() => {});
}

async function findFreeMoviles(request, t, cantidad = 3) {
  const res = await request.get(`${API_BASE}/moviles/newGrid?page=0&perPage=100`, {
    headers: authHeaders(t),
  });
  const lista = (await res.json()).moviles ?? (await res.json()).data ?? await res.json();
  const libres = [];

  for (const m of lista) {
    if (libres.length >= cantidad) break;

    // 1. Sin relación activa ahora
    const activa = await request.get(
      `${API_BASE}/movil-relaciones/activa?movil_id=${m.id}`,
      { headers: authHeaders(t) }
    );
    if (activa.status() !== 200) continue;
    const state = await activa.json();
    if (state.como_principal?.length || state.como_asociado) continue;

    // 2. Sin historial que solape la fecha de inicio fija del beforeAll (2026-05-01)
    const histRes = await request.get(
      `${API_BASE}/movil-relaciones?movil_id=${m.id}`,
      { headers: authHeaders(t) }
    );
    if (histRes.status() !== 200) continue;
    const historial = await histRes.json();
    if (!Array.isArray(historial)) continue;
    const hasConflict = historial.some(r =>
      !r.fecha_hora_fin || r.fecha_hora_fin >= '2026-05-01 08:00:00'
    );
    if (hasConflict) continue;

    libres.push({ id: m.id, dominio: m.dominio });
  }
  return libres;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe.serial('VEC-2969 — UI vinculación de activos', () => {

  test.beforeAll(async ({ request }) => {
    token = await apiLogin(request);

    // Necesitamos al menos 3 móviles libres:
    // [0] = principal (tendrá relación activa), [1] = asociado, [2] = libre (para TC-02 y TC-07)
    const libres = await findFreeMoviles(request, token, 3);
    expect(libres.length).toBeGreaterThanOrEqual(3);

    principalId = libres[0].id;
    asociadoId  = libres[1].id;
    libreId     = libres[2].id;

    // Obtener el label visible del asociado para validar en UI
    const rLabel = await request.get(
      `${API_BASE}/moviles/vinculables-select?movil_id=${principalId}`,
      { headers: authHeaders(token) }
    );
    if (rLabel.status() === 200) {
      const opts = await rLabel.json();
      const opt  = opts.find(o => o.id === asociadoId);
      asociadoLabel = opt?.label ?? String(asociadoId);
    } else {
      asociadoLabel = String(asociadoId);
    }

    // Crear relación activa para los TCs de visualización
    const crear = await request.post(`${API_BASE}/movil-relaciones`, {
      data: {
        activo_principal_id: principalId,
        activo_asociado_id:  asociadoId,
        fecha_hora_inicio:   '2026-05-01 08:00:00',
      },
      headers: authHeaders(token),
    });
    expect(crear.status()).toBe(201);
    relacionId = (await crear.json()).id;
  });

  test.afterAll(async ({ request }) => {
    await closeSilently(request, relacionId, token);
  });

  // ── VEC-3027 | Visualización ───────────────────────────────────────────────

  test('TC-01 | VEC-3027 | Sección "Relaciones" visible en la ficha del vehículo', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const vinPage   = new VinculacionPage(page);
    await loginPage.login(CREDS.username, CREDS.password);
    await vinPage.gotoDetalle(principalId);

    await expect(vinPage.headerRelaciones).toBeVisible();
  });

  test('TC-02 | VEC-3027 | Activo sin relaciones muestra "sin asociados"', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const vinPage   = new VinculacionPage(page);
    await loginPage.login(CREDS.username, CREDS.password);
    await vinPage.gotoDetalle(libreId);

    await expect(vinPage.listaAsociados).toBeVisible();
    const items = await vinPage.listaAsociados.allTextContents();
    // La lista existe pero no tiene activos asociados, o hay un mensaje vacío
    const hayAsociados = items.some(t => t.trim().length > 0 && !t.toLowerCase().includes('sin'));
    expect(hayAsociados).toBe(false);
  });

  test('TC-03 | VEC-3027 | Activo principal muestra sus activos asociados activos', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const vinPage   = new VinculacionPage(page);
    await loginPage.login(CREDS.username, CREDS.password);
    await vinPage.gotoDetalle(principalId);

    // El asociado debe aparecer en la lista de activos activos
    await expect(vinPage.listaAsociados).toBeVisible();
    await expect(
      vinPage.listaAsociados.locator(`text=${asociadoLabel}`)
    ).toBeVisible({ timeout: 10000 });
  });

  test('TC-04 | VEC-3027 | Botón "Histórico de Relaciones" abre el modal', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const vinPage   = new VinculacionPage(page);
    await loginPage.login(CREDS.username, CREDS.password);
    await vinPage.gotoDetalle(principalId);

    await vinPage.abrirHistorico();
    await expect(vinPage.modalHistorico).toBeVisible();
    await expect(vinPage.tablaHistorico).toBeVisible();
  });

  test('TC-05 | VEC-3027 | Historial muestra columnas: activo principal, asociado, fecha inicio/fin, estado', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const vinPage   = new VinculacionPage(page);
    await loginPage.login(CREDS.username, CREDS.password);
    await vinPage.gotoDetalle(principalId);
    await vinPage.abrirHistorico();

    const columnas = await vinPage.getColumnasHistorico();
    const texto    = columnas.join(' ').toLowerCase();

    expect(texto).toMatch(/principal/i);
    expect(texto).toMatch(/asociado/i);
    expect(texto).toMatch(/inicio/i);
    expect(texto).toMatch(/fin|cierre/i);
    expect(texto).toMatch(/estado/i);
  });

  test('TC-06 | VEC-3027 | Relación activa aparece en historial con estado "activo"', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const vinPage   = new VinculacionPage(page);
    await loginPage.login(CREDS.username, CREDS.password);
    await vinPage.gotoDetalle(principalId);
    await vinPage.abrirHistorico();

    const filas = await vinPage.getFilasHistorico();
    const hayActiva = filas.some(f => f.toLowerCase().includes('activo'));
    expect(hayActiva).toBe(true);
  });

  // ── VEC-3020 | Gestión manual ──────────────────────────────────────────────

  test('TC-07 | VEC-3020 | Duallistbox de activos asociados visible en modo EDIT', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const vinPage   = new VinculacionPage(page);
    await loginPage.login(CREDS.username, CREDS.password);
    await vinPage.gotoEdit(libreId);

    await expect(vinPage.duallistbox).toBeVisible();
    await expect(vinPage.leftBoxSelect).toBeVisible();
    await expect(vinPage.rightBoxSelect).toBeVisible();
  });

  test('TC-08 | VEC-3020 | Vincular activo desde EDIT → aparece como activo en la ficha', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const vinPage   = new VinculacionPage(page);
    await loginPage.login(CREDS.username, CREDS.password);

    // Cerrar primero la relación del beforeAll para que asociadoId quede libre
    await page.request.patch(`${API_BASE}/movil-relaciones/${relacionId}/cerrar`, {
      data:    { fecha_hora_fin: '2026-05-01 09:00:00' },
      headers: authHeaders(token),
    });
    relacionId = null;

    // Vincular desde UI: ir al edit de libreId y mover asociadoId al box derecho
    await vinPage.gotoEdit(libreId);
    await vinPage.vincularActivo(asociadoId);
    await vinPage.guardar();

    // Verificar en VIEW mode
    await vinPage.gotoDetalle(libreId);
    await expect(
      vinPage.listaAsociados.locator(`text=${asociadoLabel}`)
    ).toBeVisible({ timeout: 10000 });

    // Registrar la nueva relación para cleanup en afterAll (obtenemos el id vía API)
    const activa = await page.request.get(
      `${API_BASE}/movil-relaciones/activa?movil_id=${libreId}`,
      { headers: authHeaders(token) }
    );
    if (activa.status() === 200) {
      const state = await activa.json();
      relacionId = state.como_principal?.[0]?.id ?? null;
    }
  });

  test('TC-09 | VEC-3020 | Desvincular activo desde EDIT → relación pasa a histórico como "cerrado"', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const vinPage   = new VinculacionPage(page);
    await loginPage.login(CREDS.username, CREDS.password);

    // Desvincular: ir al edit de libreId y mover asociadoId al box izquierdo
    await vinPage.gotoEdit(libreId);
    await vinPage.desvincularActivo(asociadoId);
    await vinPage.guardar();
    relacionId = null;

    // Verificar en historial que aparece como "cerrado"
    await vinPage.gotoDetalle(libreId);
    await vinPage.abrirHistorico();

    const filas = await vinPage.getFilasHistorico();
    const hayCerrada = filas.some(f => f.toLowerCase().includes('cerrado'));
    expect(hayCerrada).toBe(true);
  });

});
