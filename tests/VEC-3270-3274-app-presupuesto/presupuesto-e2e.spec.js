// VEC-3270..3274 — Ciclo de vida del presupuesto (App móvil) — E2E a NIVEL API
// ---------------------------------------------------------------------------
// Esta suite ejercita el flujo de vida completo del presupuesto de un ticket
// correctivo de punta a punta, contra los MISMOS endpoints que consume la app
// móvil. La UI de la app NO se automatiza acá (requiere emulador/dispositivo);
// ver README.md para qué queda fuera de alcance.
//
// Cluster de cards:
//   VEC-3270  Visualización del presupuesto (items, totales, consistencia app/web)
//   VEC-3271  Carga inicial + envío a aprobación
//   VEC-3272  Borrador (carga parcial sin transicionar) + promoción a presupuesto
//   VEC-3273  Aprobación: completa, rechazo total, rechazo parcial, validaciones
//   VEC-3274  Adicional: cargar, borrador adicional, aprobar adicional
//
// Entorno: vec-dev SOLO. El módulo lib/presupuesto-api.js aborta si BASE no es vec-dev.
// Correr:  npx playwright test --config=playwright.app.config.js   (testDir ya apunta acá)
//   o:     npx playwright test tests/VEC-3270-3274-app-presupuesto/presupuesto-e2e.spec.js

const { test, expect } = require('@playwright/test');
const api = require('./lib/presupuesto-api');
const { crearCorrectivo } = require('./lib/ticket-factory');

const PRESUP = /PRESUPUESTAD/i; // "Presupuestado" / "Pendiente-Auditor" comparten raíz en algunos estados
const APROB  = /APROBAD/i;
const RECOT  = /RECOTIZ/i;
const ADIC   = /ADIC/i;

// Estado compartido
let token;
const creados = []; // ids para teardown

// ── Helpers de orquestación (componen el lib) ───────────────────────────────

async function nuevoTicket(detalle) {
  const { id } = await crearCorrectivo(token, detalle);
  creados.push(id);
  return id;
}

// Ticket en estado presupuestado (enviado, pendiente de aprobación)
async function ticketPresupuestado(detalle, items = [api.itemMO(1000), api.itemRepuesto(1500)]) {
  const id = await nuevoTicket(detalle);
  const env = await api.enviarPresupuesto(token, id, items, false);
  expect(env.status, 'envío inicial debe responder <300').toBeLessThan(300);
  return id;
}

// Ticket ya aprobado (listo para cargar adicional)
async function ticketAprobado(detalle) {
  const id = await ticketPresupuestado(detalle);
  const { aprobar } = await api.aprobarCompleto(token, id);
  expect(aprobar.status, 'aprobación debe responder <300').toBeLessThan(300);
  expect(await api.getEstado(token, id)).toMatch(APROB);
  return id;
}

// ── Setup / Teardown ────────────────────────────────────────────────────────

test.beforeAll(async () => {
  token = await api.login();
  console.log(`✓ Login OK contra ${api.BASE_URL}`);
});

test.afterAll(async () => {
  // Restauración: cancelamos los tickets que no quedaron en un estado terminal,
  // para no dejar basura en vec-dev. Best-effort (no rompe la corrida si falla).
  let cancelados = 0;
  for (const id of creados) {
    const r = await api.cancelarTicket(token, id).catch(() => null);
    if (r && r.status < 400) cancelados++;
  }
  console.log(`✓ Teardown: ${cancelados}/${creados.length} tickets cancelados`);
});

// ════════════════════════════════════════════════════════════════════════════
// VEC-3270 — Visualización del presupuesto
// ════════════════════════════════════════════════════════════════════════════
test.describe.serial('VEC-3270 — Visualización', () => {

  test('TC1 — Ticket sin presupuesto: items-activos devuelve estado vacío', async () => {
    const id = await nuevoTicket('VEC-3270 S02 vacío');
    const pre = await api.getEstado(token, id);

    const ia = await api.getItemsActivos(token, id);
    expect(ia.status).toBe(200);
    expect(Array.isArray(ia.body.items)).toBe(true);
    expect(ia.body.items.length, 'sin presupuesto no hay items').toBe(0);
    expect(ia.body.adicional).toBeFalsy();
    expect(pre).toBe('ABIERTO');
  });

  test('TC2 — Visualizar MO + repuesto: items, totales y estado', async () => {
    const id = await nuevoTicket('VEC-3270 S01 con items');
    const env = await api.enviarPresupuesto(token, id, [api.itemMO(1000), api.itemRepuesto(1500)], false);
    expect(env.status).toBeLessThan(300);

    const ia = await api.getItemsActivos(token, id);
    const items = ia.body.items || [];
    expect(items.length, 'deben persistir los 2 items').toBeGreaterThanOrEqual(2);
    expect(items.some(x => /Mano/i.test(x.tipo)), 'debe haber un item Mano de Obra').toBe(true);
    expect(items.some(x => /Producto|Repuesto/i.test(x.tipo)), 'debe haber un item Producto/Repuesto').toBe(true);
    const total = (ia.body.manoDeObra || 0) + (ia.body.repuestos || 0);
    expect(total, 'total > 0').toBeGreaterThan(0);
  });

  test('TC3 — Consistencia app (items-activos) vs web (grid)', async () => {
    const id = await nuevoTicket('VEC-3270 S03 consistencia');
    await api.enviarPresupuesto(token, id, [api.itemMO(1000), api.itemRepuesto(1500)], false);

    const ia = await api.getItemsActivos(token, id);
    const grid = await api.getGrid(token, id);
    const presup = grid.find(p => p.activo) || grid[0];
    expect(presup, 'el grid web debe listar al menos un presupuesto').toBeTruthy();

    // Lo que ve la app (items-activos) debe coincidir con lo que ve la web (grid).
    expect(Number(presup.manoDeObra)).toBe(Number(ia.body.manoDeObra));
    expect(Number(presup.repuestos)).toBe(Number(ia.body.repuestos));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// VEC-3271 — Carga inicial + envío a aprobación
// ════════════════════════════════════════════════════════════════════════════
test.describe.serial('VEC-3271 — Carga inicial y envío', () => {

  test('TC4 — Carga inicial MO+repuesto y envío → transiciona desde ABIERTO', async () => {
    const id = await nuevoTicket('VEC-3271 S01 envío inicial');
    const pre = await api.getEstado(token, id);
    expect(pre).toBe('ABIERTO');

    const env = await api.enviarPresupuesto(token, id, [api.itemMO(1000), api.itemRepuesto(1500)], false);
    expect(env.status).toBeLessThan(300);

    const post = await api.getEstado(token, id);
    expect(post, 'tras enviar deja de estar ABIERTO').not.toBe('ABIERTO');
    expect(post).toMatch(PRESUP);

    const ia = await api.getItemsActivos(token, id);
    expect((ia.body.items || []).length).toBeGreaterThanOrEqual(2);
  });

  test('TC5 — Validación: manoDeObra no numérica → 400, no transiciona', async () => {
    const id = await nuevoTicket('VEC-3271 S03 validación');
    // Body inválido a propósito: manoDeObra vacía y shape de item legacy.
    const res = await api.apiRequest('POST', `/ticket-presupuestos/ticket/${id}`, {
      manoDeObra: '', repuestos: 0, impuestos: 0, otros: 0, adicional: false,
      presupuestoItems: [{ id_item: api.IT_MO, descripcion: 'sin cant', precio: 1000, id_item_clasificacion: 1 }],
      presupuestoTareas: [],
    }, token);

    expect(res.status, 'campo obligatorio inválido debe rechazarse').toBeGreaterThanOrEqual(400);
    expect(await api.getEstado(token, id), 'no debe transicionar').toBe('ABIERTO');
  });

  test('TC6 — Eliminar item antes de enviar (regrabar borrador 2 → 1)', async () => {
    const id = await nuevoTicket('VEC-3271 S02 eliminar item');
    const b1 = await api.guardarBorrador(token, id, [api.itemMO(1000), api.itemMO(1000)], false);
    expect(b1.status).toBeLessThan(300);
    const n1 = ((await api.getItemsActivos(token, id)).body.items || []).length;

    const b2 = await api.guardarBorrador(token, id, [api.itemMO(1000)], false);
    expect(b2.status).toBeLessThan(300);
    const n2 = ((await api.getItemsActivos(token, id)).body.items || []).length;

    expect(n1).toBeGreaterThanOrEqual(2);
    expect(n2, 'regrabar borrador con menos items reduce el conteo').toBeLessThan(n1);
    expect(n2).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// VEC-3272 — Borrador (carga parcial) y promoción a presupuesto
// ════════════════════════════════════════════════════════════════════════════
test.describe.serial('VEC-3272 — Borrador', () => {

  test('TC7 — Borrador solo MO: persiste y NO transiciona', async () => {
    const id = await nuevoTicket('VEC-3272 S01 borrador MO');
    const pre = await api.getEstado(token, id);

    const b = await api.guardarBorrador(token, id, [api.itemMO(1000)], false);
    expect(b.status).toBeLessThan(300);
    const post = await api.getEstado(token, id);

    expect(post, 'borrador no cambia el estado del ticket').toBe(pre);
    expect(post).not.toMatch(PRESUP);
    expect(((await api.getItemsActivos(token, id)).body.items || []).length, 'el borrador persiste').toBeGreaterThan(0);
  });

  test('TC8 — Borrador solo repuesto: persiste y NO transiciona', async () => {
    const id = await nuevoTicket('VEC-3272 S02 borrador REP');
    const pre = await api.getEstado(token, id);

    const b = await api.guardarBorrador(token, id, [api.itemRepuesto(1500)], false);
    expect(b.status).toBeLessThan(300);

    expect(await api.getEstado(token, id)).toBe(pre);
    expect(((await api.getItemsActivos(token, id)).body.items || []).length).toBeGreaterThan(0);
  });

  test('TC9 — Promover borrador a presupuesto (enviar reusando idPresupuesto)', async () => {
    const id = await nuevoTicket('VEC-3272 S04 promover borrador');
    await api.guardarBorrador(token, id, [api.itemMO(1000)], false);

    const grid = await api.getGrid(token, id);
    const borr = grid.find(p => /Borrador/i.test(p.estado)) || grid[0];
    expect(borr, 'debe existir el borrador en el grid').toBeTruthy();

    const pre = await api.getEstado(token, id);
    const env = await api.enviarPresupuesto(token, id, [api.itemMO(1000)], false, borr.id);
    expect(env.status).toBeLessThan(300);

    const post = await api.getEstado(token, id);
    expect(post).not.toBe(pre);
    expect(post).toMatch(PRESUP);
    expect(((await api.getItemsActivos(token, id)).body.items || []).length).toBeGreaterThan(0);
  });

  test('TC10 — Eliminar item guardado en sesión previa (borrador 2 → 1)', async () => {
    const id = await nuevoTicket('VEC-3272 Def eliminar guardado');
    await api.guardarBorrador(token, id, [api.itemMO(1000), api.itemMO(1000)], false);
    const n1 = ((await api.getItemsActivos(token, id)).body.items || []).length;

    await api.guardarBorrador(token, id, [api.itemMO(1000)], false);
    const n2 = ((await api.getItemsActivos(token, id)).body.items || []).length;

    expect(n1).toBeGreaterThanOrEqual(2);
    expect(n2).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// VEC-3273 — Aprobación
// ════════════════════════════════════════════════════════════════════════════
test.describe.serial('VEC-3273 — Aprobación', () => {

  test('TC11 — Aprobación completa (auditor + aprobar) → APROBADO', async () => {
    const id = await ticketPresupuestado('VEC-3273 S01 aprobar');
    const pre = await api.getEstado(token, id);
    expect(pre).toMatch(PRESUP);

    const { aprobar, auditor } = await api.aprobarCompleto(token, id);
    expect(aprobar.status).toBeLessThan(300);
    if (auditor != null) expect(auditor, 'paso auditor debe responder <300').toBeLessThan(300);

    expect(await api.getEstado(token, id)).toMatch(APROB);
  });

  test('TC12 — Rechazo total → estado de recotización', async () => {
    const id = await ticketPresupuestado('VEC-3273 S02 rechazo total');
    const pre = await api.getEstado(token, id);
    expect(pre).toMatch(PRESUP);

    const { res } = await api.rechazarTotal(token, id);
    expect(res.status).toBeLessThan(300);
    expect(await api.getEstado(token, id)).toMatch(RECOT);
  });

  test('TC13 — Rechazo parcial (1 rechazado c/motivo + 1 aprobado)', async () => {
    const id = await ticketPresupuestado('VEC-3273 S03 rechazo parcial');
    const pre = await api.getEstado(token, id);

    const items = (await api.getItemsActivos(token, id)).body.items || [];
    expect(items.length, 'necesita ≥2 items para rechazo parcial').toBeGreaterThanOrEqual(2);
    const revisiones = items.map((it, idx) => ({
      id: it.id, tipoItem: 'item',
      estadoRecotizacion: idx === 0 ? 'rechazado' : 'aprobado',
      comentarioRechazo: idx === 0 ? 'QA motivo rechazo parcial' : '',
    }));

    const { res } = await api.rechazarParcial(token, id, revisiones);
    expect(res.status).toBeLessThan(300);
    expect(await api.getEstado(token, id)).toMatch(RECOT);
    expect(pre).toMatch(PRESUP);
  });

  test('TC14 — Rechazo parcial SIN motivo → 400 (comentario obligatorio)', async () => {
    const id = await ticketPresupuestado('VEC-3273 S03b motivo obligatorio');

    const items = (await api.getItemsActivos(token, id)).body.items || [];
    const revisiones = items.map((it, idx) => ({
      id: it.id, tipoItem: 'item',
      estadoRecotizacion: idx === 0 ? 'rechazado' : 'aprobado',
      comentarioRechazo: '', // a propósito sin comentario
    }));

    const { res } = await api.rechazarParcial(token, id, revisiones);
    expect(res.status, 'item rechazado sin comentario debe fallar').toBeGreaterThanOrEqual(400);
    expect(await api.getEstado(token, id), 'no transiciona si la validación falla').toMatch(PRESUP);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// VEC-3274 — Adicional
// ════════════════════════════════════════════════════════════════════════════
test.describe.serial('VEC-3274 — Adicional', () => {

  test('TC15 — Cargar adicional (adicional=true) sobre ticket APROBADO', async () => {
    const id = await ticketAprobado('VEC-3274 S01 adicional');
    const pre = await api.getEstado(token, id);
    expect(pre).toMatch(APROB);

    const env = await api.enviarPresupuesto(token, id, [api.itemMO(1000), api.itemRepuesto(1500)], true);
    expect(env.status).toBeLessThan(300);

    const post = await api.getEstado(token, id);
    expect(post, 'el adicional lleva el ticket a un estado de adicional presupuestado').toMatch(ADIC);
    expect(((await api.getItemsActivos(token, id)).body.items || []).length).toBeGreaterThan(0);
  });

  test('TC16 — Borrador adicional (adicional=true): NO transiciona', async () => {
    const id = await ticketAprobado('VEC-3274 S02 borrador adicional');
    const pre = await api.getEstado(token, id);

    const b = await api.guardarBorrador(token, id, [api.itemMO(1000)], true);
    expect(b.status).toBeLessThan(300);

    expect(await api.getEstado(token, id), 'borrador adicional no cambia estado').toBe(pre);
  });

  test('TC17 — Aprobar adicional → vuelve a APROBADO con monto visible', async () => {
    const id = await ticketAprobado('VEC-3274 S04 adicional aprobado');
    await api.enviarPresupuesto(token, id, [api.itemMO(1000)], true);
    const pre = await api.getEstado(token, id);
    expect(pre).toMatch(ADIC);

    const { aprobar } = await api.aprobarCompleto(token, id);
    expect(aprobar.status).toBeLessThan(300);

    expect(await api.getEstado(token, id)).toMatch(APROB);
    const ia = await api.getItemsActivos(token, id);
    expect((ia.body.manoDeObra || 0) + (ia.body.repuestos || 0), 'monto del adicional visible').toBeGreaterThan(0);
  });
});
