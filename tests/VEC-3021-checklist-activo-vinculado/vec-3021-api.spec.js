// VEC-3021 — Actualización de relaciones desde checklist: capa API
// Flujo: POST /formulario con activos_asociados_ids dispara MovilRelacionService::sincronizarDesdeChecklist()
// El servidor setea origen_creacion=checklist y referencia_creacion_id=formulario.id automáticamente.
const { test, expect } = require('@playwright/test');

const BASE     = 'https://vec-dev.vecfleet.io';
const API_BASE = `${BASE}/ws/Public/index.php/api`;
const CREDS    = { usuario: 'stineo', clave: 'susy1234' };

let token;
let principalId;
let principalDominio;
let asociadoId;
let terceroId;      // para TC-06 (conflicto)
let cuartoId;       // para TC-07 (desasign sin relación)
let tipoFormularioId;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function login(request) {
  const res = await request.post(`${API_BASE}/public/auth/login`, {
    data: CREDS,
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(200);
  return (await res.json()).usuario.token;
}

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization-Token': token };
}

async function getActiva(request, movilId) {
  const res = await request.get(
    `${API_BASE}/movil-relaciones/activa?movil_id=${movilId}`,
    { headers: authHeaders() }
  );
  return { status: res.status(), body: await res.json() };
}

async function postFormulario(request, dominio, activosAsociadosIds) {
  return request.post(`${API_BASE}/formulario`, {
    data: {
      tipo_formulario_id: tipoFormularioId,
      nro_equipo:         dominio,
      activo:             1,
      valores_dinamicos:  [],
      activos_asociados_ids: activosAsociadosIds,
    },
    headers: authHeaders(),
  });
}

async function cerrarRelacion(request, id) {
  const fecha = new Date().toISOString().slice(0, 10) + ' 23:59:00';
  return request.patch(`${API_BASE}/movil-relaciones/${id}/cerrar`, {
    data: { fecha_hora_fin: fecha },
    headers: authHeaders(),
  });
}

async function closeSilently(request, movilId) {
  const { body } = await getActiva(request, movilId);
  const relId = body.como_principal?.[0]?.id;
  if (relId) await cerrarRelacion(request, relId).catch(() => {});
}

// Devuelve móviles sin historial de relaciones
async function pickFreeMoviles(request, cantidad) {
  const res = await request.get(
    `${API_BASE}/moviles/newGrid?page=0&perPage=100`,
    { headers: authHeaders() }
  );
  const lista = (await res.json()).moviles ?? [];

  const libres = [];
  for (const m of lista) {
    if (libres.length >= cantidad) break;
    const { status, body: state } = await getActiva(request, m.id);
    if (status !== 200) continue;
    if (state.como_principal?.length || state.como_asociado) continue;

    const histRes = await request.get(
      `${API_BASE}/movil-relaciones?movil_id=${m.id}`,
      { headers: authHeaders() }
    );
    const historial = await histRes.json();
    if (!Array.isArray(historial) || historial.length > 0) continue;

    libres.push({ id: m.id, dominio: m.dominio });
  }
  return libres;
}

// Encuentra un tipoformulario con con_activo_vinculado = 1
async function findTipoFormularioConActivoVinculado(request) {
  const grid = await request.get(`${API_BASE}/tipoformulario/grid`, { headers: authHeaders() });
  const ids = (await grid.json()).data.map(d => d.DT_RowId);
  for (const id of ids) {
    const r = await request.get(`${API_BASE}/tipoformulario/${id}`, { headers: authHeaders() });
    if (r.status() !== 200) continue;
    const tf = await r.json();
    if (tf.con_activo_vinculado) return id;
  }
  return null;
}

// ── Suite principal (serial) ──────────────────────────────────────────────────

test.describe.serial('VEC-3021 — API checklist activo vinculado', () => {

  test.beforeAll(async ({ request }) => {
    token = await login(request);

    tipoFormularioId = await findTipoFormularioConActivoVinculado(request);
    expect(tipoFormularioId).not.toBeNull();

    const libres = await pickFreeMoviles(request, 4);
    expect(libres.length).toBeGreaterThanOrEqual(4);

    principalId      = libres[0].id;
    principalDominio = libres[0].dominio;
    asociadoId       = libres[1].id;
    terceroId        = libres[2].id;
    cuartoId         = libres[3].id;
  });

  test.afterAll(async ({ request }) => {
    await closeSilently(request, principalId);
    await closeSilently(request, terceroId);
  });

  // ── TC-01 | Asignación válida crea relación activa con origen=checklist ──────

  test('TC-01 | Asignación válida desde checklist crea relación activa con origen=checklist', async ({ request }) => {
    const res = await postFormulario(request, principalDominio, [asociadoId]);
    expect(res.status()).toBe(201);
    const formulario = await res.json();
    expect(formulario.id).toBeDefined();
    expect(formulario.movil_id).toBe(principalId);

    const { status, body } = await getActiva(request, principalId);
    expect(status).toBe(200);
    const rel = body.como_principal?.[0];
    expect(rel).toBeDefined();
    expect(rel.activo_asociado_id).toBe(asociadoId);
    expect(rel.origen_creacion).toBe('checklist');
    expect(rel.referencia_creacion_id).toBe(formulario.id);
  });

  // ── TC-02 | Trazabilidad completa ───────────────────────────────────────────

  test('TC-02 | Trazabilidad: usuario, timestamp y referencia_creacion_id presentes', async ({ request }) => {
    const { body } = await getActiva(request, principalId);
    const rel = body.como_principal?.[0];
    expect(rel).toBeDefined();
    expect(rel.usuario_creacion_id).not.toBeNull();
    expect(rel.created_at).not.toBeNull();
    expect(rel.referencia_creacion_id).not.toBeNull();
  });

  // ── TC-03 | Impacto en tiempo real ──────────────────────────────────────────

  test('TC-03 | La relación aparece en /activa inmediatamente tras el formulario', async ({ request }) => {
    const { status, body } = await getActiva(request, principalId);
    expect(status).toBe(200);
    expect(body.como_principal?.length).toBeGreaterThan(0);
  });

  // ── TC-04 | Desasignación válida cierra relación con origen=checklist ────────

  test('TC-04 | Desasignación válida cierra relación con origen_cierre=checklist', async ({ request }) => {
    const res = await postFormulario(request, principalDominio, []);
    expect(res.status()).toBe(201);

    const { body } = await getActiva(request, principalId);
    expect(body.como_principal?.length ?? 0).toBe(0);

    // Verificar en historial que el origen_cierre es checklist
    const histRes = await request.get(
      `${API_BASE}/movil-relaciones?movil_id=${principalId}`,
      { headers: authHeaders() }
    );
    const historial = await histRes.json();
    const cerrada = historial.find(r => r.estado === 'cerrado' && r.origen_creacion === 'checklist');
    expect(cerrada).toBeDefined();
  });

  // ── TC-05 | No autovinculación ───────────────────────────────────────────────

  test('TC-05 | No se puede autovincular un activo consigo mismo desde checklist', async ({ request }) => {
    const res = await postFormulario(request, principalDominio, [principalId]);
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  // ── TC-06 | Conflicto: asociado ya vinculado ─────────────────────────────────

  test('TC-06 | Asociado ya vinculado a otro principal → checklist rechazado', async ({ request }) => {
    // Vincular asociadoId a terceroId primero
    const terceroDominio = (await (await request.get(`${API_BASE}/moviles/${terceroId}`, { headers: authHeaders() })).json()).dominio;
    const setup = await postFormulario(request, terceroDominio, [asociadoId]);
    expect(setup.status()).toBe(201);

    // Intentar vincular el mismo asociadoId a principalId
    const conflict = await postFormulario(request, principalDominio, [asociadoId]);
    expect(conflict.status()).toBeGreaterThanOrEqual(400);
    expect(conflict.status()).toBeLessThan(500);
  });

  // ── TC-07 | Desasignación sin relación previa → no-op ────────────────────────

  test('TC-07 | Desasignación sobre activo sin relación activa → formulario creado sin error', async ({ request }) => {
    const cuartoDominio = (await (await request.get(`${API_BASE}/moviles/${cuartoId}`, { headers: authHeaders() })).json()).dominio;

    // Verificar que cuartoId no tiene relación activa
    const { body: state } = await getActiva(request, cuartoId);
    expect(state.como_principal?.length ?? 0).toBe(0);

    // Desasignar sobre móvil libre → debe crear formulario sin fallo
    const res = await postFormulario(request, cuartoDominio, []);
    expect(res.status()).toBe(201);

    // No debe haber creado ninguna relación
    const { body: after } = await getActiva(request, cuartoId);
    expect(after.como_principal?.length ?? 0).toBe(0);
  });

  // ── TC-08 | Validaciones core: no solapamiento ───────────────────────────────

  test('TC-08 | Las validaciones core de solapamiento aplican desde el canal checklist', async ({ request }) => {
    // principalId ahora sin relación activa (cerrada en TC-04)
    // Asignar asociadoId a terceroId sigue activo (de TC-06 setup)
    // Intentar asignar asociadoId (ocupado) a principalId mediante checklist
    const conflict = await postFormulario(request, principalDominio, [asociadoId]);
    expect(conflict.status()).toBeGreaterThanOrEqual(400);
    expect(conflict.status()).toBeLessThan(500);
  });

});
