// VEC-1405 — Combustibles: rendimiento propio no funciona
// Bug: cuando rendimiento_propio=true en el móvil, validarCarga() ignoraba ese valor
//      y solo ejecutaba el control si el móvil heredaba rendimiento desde el modelo.
// Fix: corregido en CombustiblesRepository::validarCarga().
//
// Flujo:
//   PUT /moviles/{id}            → configura rendimientoPropio + rendimientoEsperado
//   POST /combustibles/sync ×n   → registra cargas con km/litros conocidos
//   GET  /combustibles/controles-carga → dispara validarCarga() en registros pendientes
//   GET  /combustibles/grid/{date}/{date}?dominio=X → verifica control_rendimiento
//
// Diseño de fechas y km:
//   checkOdometerExceedLimit() rechaza el odómetro si km_delta > limiteOdometroMensual/30/24 * horas.
//   Usando 2 días (48h) entre cargas y delta=20 km, incluso un límite muy conservador de
//   300 km/mes tolera 20 km en 48h (límite proporcional ≈ 0.4 km/h * 48 = 19.2, redondeo al alza).
//   Para estar seguros se usa delta=20 km.
//
//   VALIDA:   delta=20 km, litros=2  → rendimiento=10 km/L = RENDIMIENTO_ESPERADO
//   INVALIDA: delta=20 km, litros=200 → rendimiento≈0.1 km/L → muy lejos del esperado
const { test, expect } = require('@playwright/test');

const BASE     = 'https://vec-dev.vecfleet.io';
const API_BASE = `${BASE}/ws/Public/index.php/api`;
const CREDS    = { usuario: 'stineo', clave: 'susy1234' };

const RENDIMIENTO_ESPERADO = 10;

// Cada carga en un día distinto con 2 días de separación
function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

const DATE_BASE     = daysAgo(8);
const DATE_VALIDA   = daysAgo(6);
const DATE_INVALIDA = daysAgo(4);
const DATE_TC03     = daysAgo(2);
const DATE_TC04     = daysAgo(1);

const KM_DELTA        = 20;
const LITROS_VALIDA   = 2;   // 20km / 2L   = 10 km/L ← RENDIMIENTO_ESPERADO
const LITROS_INVALIDA = 200; // 20km / 200L ≈ 0.1 km/L ← muy lejos del esperado

let token;
let movilId;
let movilDominio;
let originalMovilBody;
let kmBase;

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

async function getMovil(request, id) {
  const res = await request.get(`${API_BASE}/moviles/${id}`, { headers: authHeaders() });
  expect(res.status()).toBe(200);
  return res.json();
}

async function setRendimiento(request, body, propio, esperado) {
  // El controller (MovilController.php:1207) lee tipologia_posicion.id (snake_case, objeto).
  // El GET devuelve tipologia_posicion_id (int) y tipologiaPosicion (camelCase).
  // Si no se envía tipologia_posicion como objeto anidado, el controller queda con id=null
  // y detecta un "cambio" de tipología, fallando si el vehículo tiene llantas.
  const { tipologiaPosicion, ...cleanBody } = body;
  const res = await request.put(`${API_BASE}/moviles/${movilId}`, {
    data: {
      ...cleanBody,
      tipologia_posicion: { id: body.tipologia_posicion_id },
      rendimientoPropio:   propio,
      rendimientoEsperado: esperado,
    },
    headers: authHeaders(),
  });
  expect(res.status()).toBeLessThan(300);
}

async function syncLoad(request, date, time, km, litros) {
  return request.post(`${API_BASE}/combustibles/sync`, {
    data: [{
      license_plate:      movilDominio,
      fuel_entry_date:    date,
      fuel_entry_time:    time,
      unit:               'liters',
      unit_qty:           litros,
      price_unit:         1.5,
      odometer:           km,
      fuel_type:          'NAFTA',
      fuel_card_provider: 'TEST',
    }],
    headers: authHeaders(),
  });
}

// Dispara validarCarga() en todos los registros pendientes (valido_direccion_avl=0)
async function runControles(request) {
  const res = await request.get(`${API_BASE}/combustibles/controles-carga`, {
    headers: authHeaders(),
  });
  expect(res.status()).toBeLessThan(300);
}

// Devuelve las cargas de una fecha específica para el móvil bajo prueba
async function getGrid(request, date) {
  const res = await request.get(
    `${API_BASE}/combustibles/grid/${date}/${date}?page=0&perPage=50&dominio=${encodeURIComponent(movilDominio)}`,
    { headers: authHeaders() }
  );
  expect(res.status()).toBe(200);
  return (await res.json()).combustibles ?? [];
}

// Localiza una carga por su odómetro exacto
function findCarga(cargas, km) {
  return cargas.find(c => Number(c.odometro) === km);
}

// Busca un móvil sin cargas en los últimos 10 días.
// Devuelve { id, dominio, kmBase } donde kmBase es el km de partida para la secuencia de test.
async function pickMovilParaCombustibles(request) {
  const hoy    = new Date().toISOString().slice(0, 10);
  const hace10 = daysAgo(10);

  const listRes = await request.get(
    `${API_BASE}/moviles/newGrid?page=0&perPage=100`,
    { headers: authHeaders() }
  );
  const lista = ((await listRes.json()).moviles ?? []).slice(0, 40);

  for (const m of lista) {
    if (!m.dominio) continue;

    // Verificar sin cargas en los últimos 10 días (cubre los 8 días del test)
    const recentRes = await request.get(
      `${API_BASE}/combustibles/grid/${hace10}/${hoy}?page=0&perPage=1&dominio=${encodeURIComponent(m.dominio)}`,
      { headers: authHeaders() }
    );
    if (recentRes.status() !== 200) continue;
    if ((await recentRes.json()).combustibles?.length > 0) continue;

    // Calcular km base: max odómetro del historial completo + 200
    const histRes = await request.get(
      `${API_BASE}/combustibles/grid/2020-01-01/${hoy}?page=0&perPage=10&dominio=${encodeURIComponent(m.dominio)}`,
      { headers: authHeaders() }
    );
    if (histRes.status() !== 200) continue;
    const hist = (await histRes.json()).combustibles ?? [];
    const maxHistKm  = hist.reduce((max, r) => Math.max(max, Number(r.odometro) || 0), 0);
    const movilKmActual = parseInt(m.kmActual) || 0;
    const base = Math.max(maxHistKm, movilKmActual) + 200;

    return { id: m.id, dominio: m.dominio, kmBase: base };
  }
  return null;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe.serial('VEC-1405 — Combustibles: rendimiento propio', () => {

  test.setTimeout(120000);

  test.beforeAll(async ({ request }) => {
    token = await login(request);

    const movil = await pickMovilParaCombustibles(request);
    expect(movil, 'No se encontró un móvil sin cargas en los últimos 10 días').not.toBeNull();

    movilId      = movil.id;
    movilDominio = movil.dominio;
    kmBase       = movil.kmBase;

    // Guardar cuerpo completo para restaurar en afterAll
    originalMovilBody = await getMovil(request, movilId);

    // Configurar rendimiento propio para TC-01 y TC-02
    await setRendimiento(request, originalMovilBody, true, RENDIMIENTO_ESPERADO);

    // Carga base: establece el odómetro de referencia (queda SIN_COMPROBACION — sin carga previa)
    const base = await syncLoad(request, DATE_BASE, '08:00', kmBase, 40);
    expect(base.status()).toBe(200);
    expect((await base.json())[0]?.result).toBe(true);
  });

  test.afterAll(async ({ request }) => {
    if (!originalMovilBody) return;
    await setRendimiento(
      request, originalMovilBody,
      originalMovilBody.rendimientoPropio  ?? false,
      originalMovilBody.rendimientoEsperado ?? null
    ).catch(() => {});
  });

  // ── TC-01 | Rendimiento propio VALIDA ────────────────────────────────────

  test('TC-01 | Rendimiento propio: consumo dentro del rango → control_rendimiento=VALIDA', async ({ request }) => {
    // 20km / 2L = 10 km/L = RENDIMIENTO_ESPERADO → VALIDA
    const r = await syncLoad(request, DATE_VALIDA, '08:00', kmBase + KM_DELTA, LITROS_VALIDA);
    expect(r.status()).toBe(200);
    expect((await r.json())[0]?.result).toBe(true);

    // Capturar ID antes de controles — validarCarga() puede modificar odometro
    const cargasAntes = await getGrid(request, DATE_VALIDA);
    const cargaAntes  = findCarga(cargasAntes, kmBase + KM_DELTA);
    expect(cargaAntes, 'Carga VALIDA no registrada antes de controles').toBeDefined();

    await runControles(request);

    const cargas = await getGrid(request, DATE_VALIDA);
    const carga  = cargas.find(c => c.id === cargaAntes.id);
    expect(carga, 'Carga VALIDA no encontrada en la grilla').toBeDefined();
    expect(carga.control_rendimiento).toBe('VALIDA');
  });

  // ── TC-02 | Rendimiento propio INVALIDA ──────────────────────────────────

  test('TC-02 | Rendimiento propio: consumo anómalo → control_rendimiento=INVALIDA', async ({ request }) => {
    // 20km / 200L ≈ 0.1 km/L → muy lejos de RENDIMIENTO_ESPERADO=10 → INVALIDA
    const r = await syncLoad(request, DATE_INVALIDA, '08:00', kmBase + KM_DELTA * 2, LITROS_INVALIDA);
    expect(r.status()).toBe(200);
    expect((await r.json())[0]?.result).toBe(true);

    const cargasAntes = await getGrid(request, DATE_INVALIDA);
    const cargaAntes  = findCarga(cargasAntes, kmBase + KM_DELTA * 2);
    expect(cargaAntes, 'Carga INVALIDA no registrada antes de controles').toBeDefined();

    await runControles(request);

    const cargas = await getGrid(request, DATE_INVALIDA);
    const carga  = cargas.find(c => c.id === cargaAntes.id);
    expect(carga, 'Carga INVALIDA no encontrada en la grilla').toBeDefined();
    expect(carga.control_rendimiento).toBe('INVALIDA');
  });

  // ── TC-03 | rendimiento_propio=false → usa rendimiento del modelo ─────────

  test('TC-03 | rendimiento_propio=false: sistema cae al rendimiento del modelo', async ({ request }) => {
    // Desactivar rendimiento propio — usa el del modelo (o SIN_COMPROBACION si no tiene)
    await setRendimiento(request, originalMovilBody, false, null);

    const r = await syncLoad(request, DATE_TC03, '08:00', kmBase + KM_DELTA * 3, LITROS_VALIDA);
    expect(r.status()).toBe(200);
    expect((await r.json())[0]?.result).toBe(true);

    const cargasAntes = await getGrid(request, DATE_TC03);
    const cargaAntes  = findCarga(cargasAntes, kmBase + KM_DELTA * 3);
    expect(cargaAntes, 'Carga TC-03 no registrada antes de controles').toBeDefined();

    await runControles(request);

    const cargas = await getGrid(request, DATE_TC03);
    const carga  = cargas.find(c => c.id === cargaAntes.id);
    expect(carga, 'Carga TC-03 no encontrada en la grilla').toBeDefined();

    // Con rendimiento_propio=false el sistema NO usa el RENDIMIENTO_ESPERADO=10 del vehículo.
    // El resultado depende del rendimiento del modelo; el estado debe ser un valor conocido.
    expect(carga.control_rendimiento).not.toBeNull();
    expect(['VALIDA', 'INVALIDA', 'SIN_COMPROBACION']).toContain(carga.control_rendimiento);

    // Restaurar para TC-04
    await setRendimiento(request, originalMovilBody, true, RENDIMIENTO_ESPERADO);
  });

  // ── TC-04 | rendimiento_propio=true sin valor → cae al modelo ─────────────

  test('TC-04 | rendimiento_propio=true sin rendimientoEsperado → cae al modelo o SIN_COMPROBACION', async ({ request }) => {
    // Flag activo pero sin valor: PHP evalúa (true && null) = false → cae al modelo
    await setRendimiento(request, originalMovilBody, true, null);

    const r = await syncLoad(request, DATE_TC04, '08:00', kmBase + KM_DELTA * 4, LITROS_VALIDA);
    expect(r.status()).toBe(200);
    expect((await r.json())[0]?.result).toBe(true);

    const cargasAntes = await getGrid(request, DATE_TC04);
    const cargaAntes  = findCarga(cargasAntes, kmBase + KM_DELTA * 4);
    expect(cargaAntes, 'Carga TC-04 no registrada antes de controles').toBeDefined();

    await runControles(request);

    const cargas = await getGrid(request, DATE_TC04);
    const carga  = cargas.find(c => c.id === cargaAntes.id);
    expect(carga, 'Carga TC-04 no encontrada en la grilla').toBeDefined();
    expect(carga.control_rendimiento).not.toBeNull();
    expect(['VALIDA', 'INVALIDA', 'SIN_COMPROBACION']).toContain(carga.control_rendimiento);
  });

});
