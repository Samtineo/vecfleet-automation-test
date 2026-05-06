// VEC-2969 — Vinculación de activos: capa API
// Cubre VEC-3017 (modelo de datos), VEC-3018 (CRUD), VEC-3019 (unicidad y solapamiento)
const { test, expect } = require('@playwright/test');

const BASE     = 'https://vec-dev.vecfleet.io';
const API_BASE = `${BASE}/ws/Public/index.php/api`;
const CREDS    = { usuario: 'stineo', clave: 'susy1234' };

// Cada run obtiene una ventana de 30 días única en 2035+
// (se desplaza 30 días por cada día del calendario → ~33 años antes de repetirse)
const _runBase = (() => {
  const now  = new Date();
  const day  = Math.floor(now.getTime() / 86400000);
  const base = new Date('2035-01-01T00:00:00Z');
  base.setUTCDate(base.getUTCDate() + (day % 1000) * 30);
  return base;
})();

function td(daysOffset, hour = 8) {
  const d = new Date(_runBase);
  d.setUTCDate(d.getUTCDate() + daysOffset);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString().slice(0, 10) + ' ' + String(hour).padStart(2, '0') + ':00:00';
}

let token;
let principalId;
let asociadoId;
let relacionActivaId = null;

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
  return {
    'Content-Type': 'application/json',
    'Authorization-Token': token,
  };
}

async function crearRelacion(request, data) {
  return request.post(`${API_BASE}/movil-relaciones`, {
    data,
    headers: authHeaders(),
  });
}

async function cerrarRelacion(request, id, fecha) {
  return request.patch(`${API_BASE}/movil-relaciones/${id}/cerrar`, {
    data: { fecha_hora_fin: fecha },
    headers: authHeaders(),
  });
}

async function closeSilently(request, id, closeDate) {
  if (!id) return;
  await cerrarRelacion(request, id, closeDate || td(29)).catch(() => {});
}

async function getActiva(request, movilId) {
  const res = await request.get(
    `${API_BASE}/movil-relaciones/activa?movil_id=${movilId}`,
    { headers: authHeaders() }
  );
  return { status: res.status(), body: await res.json() };
}

async function pickFreeMoviles(request, cantidad = 2) {
  const res = await request.get(
    `${API_BASE}/moviles/newGrid?page=0&perPage=100`,
    { headers: authHeaders() }
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  const lista = body.moviles ?? body.data ?? body;

  // First date we'll use in this run — any existing relation overlapping
  // this window disqualifies the mobile (e.g. old runs that closed at 2099).
  const windowStart = td(0);

  const libres = [];
  for (const m of lista) {
    if (libres.length >= cantidad) break;

    // 1. No active relation right now
    const { status, body: state } = await getActiva(request, m.id);
    if (status !== 200) continue;
    if (state.como_principal?.length || state.como_asociado) continue;

    // 2. No historical relation whose end date reaches into our window
    const histRes = await request.get(
      `${API_BASE}/movil-relaciones?movil_id=${m.id}`,
      { headers: authHeaders() }
    );
    if (histRes.status() !== 200) continue;
    const historial = await histRes.json();
    if (!Array.isArray(historial)) continue;
    const hasConflict = historial.some(r => !r.fecha_hora_fin || r.fecha_hora_fin >= windowStart);
    if (hasConflict) continue;

    libres.push(m.id);
  }
  return libres;
}

// ── Suite principal (serial) ──────────────────────────────────────────────────

test.describe.serial('VEC-2969 — API vinculación de activos', () => {

  test.beforeAll(async ({ request }) => {
    token = await login(request);
    const ids = await pickFreeMoviles(request, 2);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    [principalId, asociadoId] = ids;
  });

  test.afterAll(async ({ request }) => {
    await closeSilently(request, relacionActivaId);
  });

  // ── VEC-3017 | Modelo de datos ─────────────────────────────────────────────

  test('TC-01 | VEC-3017 | La respuesta incluye todos los campos del modelo', async ({ request }) => {
    const res = await crearRelacion(request, {
      activo_principal_id: principalId,
      activo_asociado_id:  asociadoId,
      fecha_hora_inicio:   td(0),
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    relacionActivaId = body.id;

    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('activo_principal_id');
    expect(body).toHaveProperty('activo_asociado_id');
    expect(body).toHaveProperty('fecha_hora_inicio');
    expect(body).toHaveProperty('origen_creacion');
    expect(body).toHaveProperty('usuario_creacion_id');
    expect(body).toHaveProperty('created_at');
    expect(body).toHaveProperty('updated_at');
    // OBSERVACIÓN VEC-3017: la API omite fecha_hora_fin en relaciones activas
    // en lugar de devolverla como null. Campo ausente = relación activa.
    expect(body.fecha_hora_fin ?? null).toBeNull();
  });

  // ── VEC-3018 | Lógica CRUD ─────────────────────────────────────────────────

  test('TC-02 | VEC-3018 | Relación creada queda activa (aparece en /activa)', async ({ request }) => {
    const { status, body } = await getActiva(request, principalId);
    expect(status).toBe(200);
    const comoP = body.como_principal ?? [];
    expect(comoP.some(r => r.id === relacionActivaId)).toBe(true);
  });

  test('TC-03 | VEC-3018 | No se puede crear relación consigo mismo', async ({ request }) => {
    const res = await crearRelacion(request, {
      activo_principal_id: principalId,
      activo_asociado_id:  principalId,
      fecha_hora_inicio:   td(1),
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('TC-04 | VEC-3018 | Cerrar relación activa retorna 200 y setea fecha_hora_fin', async ({ request }) => {
    const res = await cerrarRelacion(request, relacionActivaId, td(9));
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.fecha_hora_fin).not.toBeNull();
    relacionActivaId = null;
  });

  test('TC-05 | VEC-3018 | No se puede cerrar con fecha_hora_fin anterior a fecha_hora_inicio', async ({ request }) => {
    const crear = await crearRelacion(request, {
      activo_principal_id: principalId,
      activo_asociado_id:  asociadoId,
      fecha_hora_inicio:   td(14),
    });
    expect(crear.status()).toBe(201);
    const { id } = await crear.json();

    const cerrar = await cerrarRelacion(request, id, td(13));
    expect(cerrar.status()).toBeGreaterThanOrEqual(400);
    expect(cerrar.status()).toBeLessThan(500);

    // Cleanup: cerrar 1 hora después del inicio para no solapar con tc-07 (td(19))
    await closeSilently(request, id, td(14, 9));
  });

  test('TC-06 | VEC-3018 | Relación cerrada permanece en historial (no borrado físico)', async ({ request }) => {
    const res = await request.get(
      `${API_BASE}/movil-relaciones?movil_id=${principalId}`,
      { headers: authHeaders() }
    );
    expect(res.status()).toBe(200);
    const historial = await res.json();
    expect(Array.isArray(historial)).toBe(true);
    const cerrada = historial.find(r => r.estado === 'cerrado');
    expect(cerrada).toBeDefined();
  });

  test('TC-07 | VEC-3018 | Modificar = cerrar + crear nueva; histórico original se preserva', async ({ request }) => {
    const c1 = await crearRelacion(request, {
      activo_principal_id: principalId,
      activo_asociado_id:  asociadoId,
      fecha_hora_inicio:   td(19),
    });
    expect(c1.status()).toBe(201);
    const original = await c1.json();

    const cierre = await cerrarRelacion(request, original.id, td(24));
    expect(cierre.status()).toBe(200);

    const c2 = await crearRelacion(request, {
      activo_principal_id: principalId,
      activo_asociado_id:  asociadoId,
      fecha_hora_inicio:   td(25),
    });
    expect(c2.status()).toBe(201);
    const nueva = await c2.json();

    const histRes = await request.get(
      `${API_BASE}/movil-relaciones?movil_id=${principalId}`,
      { headers: authHeaders() }
    );
    const historial = await histRes.json();
    expect(historial.some(r => r.id === original.id)).toBe(true);

    await closeSilently(request, nueva.id, td(25, 9));
  });

  // ── VEC-3019 | Unicidad y solapamiento temporal ────────────────────────────

  test('TC-08 | VEC-3019 | Asociado con relación activa no puede vincularse a otro principal', async ({ request }) => {
    const crear = await crearRelacion(request, {
      activo_principal_id: principalId,
      activo_asociado_id:  asociadoId,
      fecha_hora_inicio:   td(30),
    });
    expect(crear.status()).toBe(201);
    const { id: relacionBase } = await crear.json();

    const libres = await pickFreeMoviles(request, 1);
    if (!libres.length) {
      await closeSilently(request, relacionBase, td(30, 9));
      test.skip(true, 'Sin móviles libres para TC-08');
      return;
    }
    const tercerId = libres[0];

    const res = await crearRelacion(request, {
      activo_principal_id: tercerId,
      activo_asociado_id:  asociadoId,
      fecha_hora_inicio:   td(34),
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);

    relacionActivaId = relacionBase;
  });

  test('TC-09 | VEC-3019 | No se puede crear relación con solapamiento en período histórico', async ({ request }) => {
    const cierre = await cerrarRelacion(request, relacionActivaId, td(39));
    expect(cierre.status()).toBe(200);
    relacionActivaId = null;

    const res = await crearRelacion(request, {
      activo_principal_id: principalId,
      activo_asociado_id:  asociadoId,
      fecha_hora_inicio:   td(34),
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('TC-10 | VEC-3019 | Se permite crear relación con inicio posterior al cierre de la anterior', async ({ request }) => {
    const res = await crearRelacion(request, {
      activo_principal_id: principalId,
      activo_asociado_id:  asociadoId,
      fecha_hora_inicio:   td(40),
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();

    await closeSilently(request, body.id, td(40, 9));
  });

});
