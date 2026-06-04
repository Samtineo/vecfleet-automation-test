// VEC-3171 — Tickets | Presupuesto Simple | Marcar tareas realizadas al cerrar
// y generar ticket derivado por las no realizadas
//
// Este archivo cubre los casos de aceptación que requieren validación UI.
// Los CAs puramente de API se ejecutan vía Newman / Postman collection.
//
// ─────────────────────────────────────────────────────────────────────────────
// CA cubiertos aquí:
//   CA07 — Presupuesto Detallado: selector de tareas NO aparece, flujo normal
//
// Background (prerequisito de todos los CAs del feature):
//   El cliente tiene Presupuesto Simple + Tareas de Cierre habilitados.
//   EXCEPCIÓN — CA07 usa vec-dev que tiene Presupuesto DETALLADO, exactamente
//   para verificar que el feature queda gateado.
//
// Endpoint del feature: POST /tickets/{id}/completed
// ─────────────────────────────────────────────────────────────────────────────

const { test, expect } = require('@playwright/test');
const { LoginPage } = require('./pages/LoginPage');
const { TicketDetailPage } = require('./pages/TicketDetailPage');

const CREDENTIALS = { username: 'stineo', password: 'susy1234' };
const API_BASE    = 'https://vec-dev.vecfleet.io/ws/Public/index.php/api';

// Móvil y servicio disponibles en vec-dev para tickets de prueba
const MOVIL_ID   = 25;
const SERVICIO_ID = 38;

// ── Helpers de API ────────────────────────────────────────────────────────────

/** Login y devuelve el token de sesión. */
async function apiLogin() {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ usuario: CREDENTIALS.username, clave: CREDENTIALS.password });
    const opts = {
      hostname: 'vec-dev.vecfleet.io',
      path: '/ws/Public/index.php/api/public/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = require('https').request(opts, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => resolve(JSON.parse(data).usuario.token));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** POST a la API de vec-dev. Devuelve { status, body }. */
async function apiPost(path, body, token) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const raw = JSON.stringify(body);
    const opts = {
      hostname: 'vec-dev.vecfleet.io',
      path: `/ws/Public/index.php/api${path}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization-Token': token,
        'Content-Length': Buffer.byteLength(raw),
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.write(raw);
    req.end();
  });
}

/**
 * Crea un ticket correctivo, le agrega presupuesto (Presupuesto Detallado) y
 * lo lleva a estado EN_REPARACION vía API.
 * Devuelve el ID del ticket creado.
 */
async function setupTicketEnReparacion(token) {
  // 1. Crear ticket CORRECTIVO
  const createRes = await apiPost('/tickets', {
    ticketTipo: 'CORRECTIVO',
    estado: 'ABIERTO',
    movil: { id: MOVIL_ID },
    servicio: { id: SERVICIO_ID },
    titulo: 'QA VEC-3171 CA07 — UI test',
  }, token);
  if (createRes.status >= 400) {
    throw new Error(`No se pudo crear ticket: HTTP ${createRes.status} — ${JSON.stringify(createRes.body)}`);
  }
  const ticketId = createRes.body.id;

  // 2. Agregar presupuesto (Presupuesto Detallado: repuestos y manoDeObra son números)
  const presupRes = await apiPost(`/ticket-presupuestos/ticket/${ticketId}`, {
    repuestos: 100,
    manoDeObra: 50,
    otros: 0,
    impuestos: 0,
    servicioId: SERVICIO_ID,
  }, token);
  if (presupRes.status >= 400) {
    throw new Error(`No se pudo crear presupuesto: HTTP ${presupRes.status} — ${JSON.stringify(presupRes.body)}`);
  }

  // 3. Enviar a reparar → EN_REPARACION
  const reparRes = await apiPost(`/tickets/enviar-a-reparar/${ticketId}`, {}, token);
  if (reparRes.status >= 400) {
    throw new Error(`No se pudo enviar a reparar: HTTP ${reparRes.status} — ${JSON.stringify(reparRes.body)}`);
  }

  return ticketId;
}

/** Cancela el ticket de prueba para dejar el entorno limpio. */
async function teardownTicket(ticketId, token) {
  await apiPost(`/tickets/cancelar/${ticketId}`, { motivo: 'Cleanup QA VEC-3171' }, token);
}

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe.serial('VEC-3171 — Tareas de Cierre: validaciones UI', () => {
  let loginPage;
  let ticketPage;
  let token;
  let ticketId;

  test.beforeAll(async () => {
    token = await apiLogin();
    ticketId = await setupTicketEnReparacion(token);
  });

  test.afterAll(async () => {
    if (ticketId) {
      await teardownTicket(ticketId, token).catch(() => {});
    }
  });

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    ticketPage = new TicketDetailPage(page);
    await loginPage.login(CREDENTIALS.username, CREDENTIALS.password);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // CA07 — Presupuesto Detallado: el selector de tareas NO debe aparecer
  // ────────────────────────────────────────────────────────────────────────────
  // Dado que vec-dev tiene Presupuesto DETALLADO (no Simple)
  // Cuando el usuario pasa el ticket a "Listo para Retirar"
  // Entonces el flujo se comporta igual que antes de VEC-3171:
  //   • NO aparece modal/selector de "Tareas de Cierre"
  //   • El ticket transiciona a LISTO_PARA_RETIRAR normalmente
  // ────────────────────────────────────────────────────────────────────────────

  test('Presupuesto Detallado — botón "Listo para Retirar" visible en ticket EN_REPARACION', async ({ page }) => {
    await ticketPage.gotoTicket(ticketId);
    await expect(ticketPage.btnListoParaRetirar).toBeVisible({ timeout: 10000 });
  });

  test('Presupuesto Detallado — acción "Listo para Retirar" no muestra selector de Tareas de Cierre', async ({ page }) => {
    await ticketPage.gotoTicket(ticketId);
    await ticketPage.clickListoParaRetirar();

    // Esperar brevemente para que cualquier modal tenga tiempo de renderizarse
    await page.waitForTimeout(2000);

    // El modal/selector de "Tareas de Cierre" NO debe estar visible
    // (es exclusivo de clientes con Presupuesto Simple)
    await expect(ticketPage.modalTareasCierre).not.toBeVisible();

    // Completar el flujo normal (confirmar el form de costos si aparece)
    // para que el ticket transite a LISTO_PARA_RETIRAR y TC-03 pueda verificarlo
    await ticketPage.confirmarListoParaRetirar();
  });

  test('Presupuesto Detallado — ticket transiciona a LISTO_PARA_RETIRAR sin paso intermedio de tareas', async ({ page }) => {
    // Verificar vía API que el ticket llegó a LISTO_PARA_RETIRAR
    // (el TC-02 ya ejecutó la acción; en serial los tests comparten estado del ticket)
    const https = require('https');
    const estado = await new Promise((resolve, reject) => {
      const opts = {
        hostname: 'vec-dev.vecfleet.io',
        path: `/ws/Public/index.php/api/tickets/${ticketId}`,
        method: 'GET',
        headers: { 'Authorization-Token': token },
      };
      const req = https.request(opts, res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => resolve(JSON.parse(data).estado));
      });
      req.on('error', reject);
      req.end();
    });
    expect(estado).toBe('LISTO_PARA_RETIRAR');
  });
});
