// VEC-3022 — Importador de Vehículos: columna Activo Asociado
// Endpoint: POST /moviles/importar-excel/movil (multipart/form-data, file=<xlsx>)
// La columna "Activo Asociado" solo aparece en la plantilla si moviles.vinculacionActivos.habilitado=true.
//
// Respuesta exitosa: { filas_fallaron: {} }
// Respuesta con errores de fila: { filas_fallaron: { "1": [{fila, dominio, error, ...}] } }
//
// Columnas requeridas en vec-dev (trabajaConDivisiones=false, rentadora=true,
// transportadora=true, sedeExterna=true, vinculacionActivos=true):
// ENCABEZADO_IMPORTADOR_MOVIL_INICIAL + DNI/ID Coordinador + Rentadora + Transportadora
// + Sede Externa + Ayudante + Ploteado + Tipo de Ploteo + Activo Asociado
const { test, expect } = require('@playwright/test');
const XLSX = require('xlsx');

const BASE     = 'https://vec-dev.vecfleet.io';
const API_BASE = `${BASE}/ws/Public/index.php/api`;
const CREDS    = { usuario: 'stineo', clave: 'susy1234' };

// ── Excel helpers ─────────────────────────────────────────────────────────────

const HEADERS = [
  // ENCABEZADO_IMPORTADOR_MOVIL_INICIAL
  'Dominio','Unidad','Base','Modelo','Chasis','Motor','Color','Año','Fecha Alta','Fecha Baja',
  'DNI/ID CHOFER #1','DNI/ID CHOFER #2','DNI/ID Supervisor','C. Costos','Póliza','Lugar Guarda',
  'Telepeaje','Tarjeta de Combustible','Kilometraje','Activo Fijo','N. Título','Observaciones',
  'Estado','Combustible','Prov. Gps','Comp. Origen','Plan Mant. Preventivo','Plan Mant. Vencimiento',
  'Fecha Inicio Operacion','Funcion','Diagrama de Posicion','Rendimiento Propio','Rendimiento Esperado',
  'Fecha Fin Garantia','Fecha Fin Contrato','Valor Poliza','Temporal','Cebe','Certificado Vtv',
  'Dnrpa Seccional','Traccion','Titular','Gps Modelo','Buscar Infracciones','Clase',
  'Valor Adquisicion','Valor Amortizacion','Valor Contable','Valor Alquier',
  'Peso Carga Total Autorizado','Peso Carga Maxima','Volumen Area Carga','Cantidad Compartimentos',
  'Altura Espacio Carga','Ancho Espacio Carga','Longitud Espacio Carga','Sync Avl',
  // Dynamic (based on vec-dev config):
  'DNI/ID Coordinador',
  'Rentadora',      // moviles.rentadora.habilitado=true
  'Transportadora', // moviles.transportadora.grilla=true
  'Sede Externa',   // sedeExterna.habilitado=true
  'Ayudante',
  'Ploteado',
  'Tipo de Ploteo',
  'Activo Asociado', // moviles.vinculacionActivos.habilitado=true
];

// Genera un Excel con una sola fila de datos. Solo pone dominio y activoAsociado;
// el resto queda vacío (import actualiza el vehículo sin pisar campos no enviados).
function buildImportExcel(dominio, activoAsociado = '') {
  const row = new Array(HEADERS.length).fill('');
  row[HEADERS.indexOf('Dominio')] = dominio;
  if (activoAsociado) row[HEADERS.indexOf('Activo Asociado')] = activoAsociado;

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, row]);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ── Estado de la suite ────────────────────────────────────────────────────────

let token;
let principalId;
let principalDominio;
let asociadoId;
let asociadoDominio;
let sedanTipoData = null; // datos originales del tipo SEDAN, para TC-04

// ── Helpers API ───────────────────────────────────────────────────────────────

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

async function importarExcel(request, dominio, activoAsociado = '') {
  const buf = buildImportExcel(dominio, activoAsociado);
  return request.post(`${API_BASE}/moviles/importar-excel/movil`, {
    multipart: {
      file: {
        name:     'test.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer:   buf,
      },
    },
    headers: { 'Authorization-Token': token },
  });
}

async function getActiva(request, movilId) {
  const res = await request.get(
    `${API_BASE}/movil-relaciones/activa?movil_id=${movilId}`,
    { headers: authHeaders() }
  );
  return res.status() === 200 ? res.json() : null;
}

async function closeSilently(request, movilId) {
  const state = await getActiva(request, movilId);
  const relId = state?.como_principal?.[0]?.id;
  if (relId) {
    // Server is Argentina (UTC-3): send local time so fin >= inicio
    const fin = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    await request.patch(`${API_BASE}/movil-relaciones/${relId}/cerrar`, {
      data:    { fecha_hora_fin: fin },
      headers: authHeaders(),
    }).catch(() => {});
  }
}

function errorsDe(body) {
  const filas = body.filas_fallaron ?? {};
  return Object.values(filas).flat().map(e => e.error ?? JSON.stringify(e)).join(' ');
}

function filasConError(body) {
  return Object.values(body.filas_fallaron ?? {}).flat().length;
}

// Devuelve true si el móvil tiene alguna relación cerrada con fin > ahora,
// lo que impediría crear una nueva relación que empiece ahora.
async function hasConflictingHistory(request, movilId) {
  const now = new Date();
  const hRes = await request.get(
    `${API_BASE}/movil-relaciones?movil_id=${movilId}`,
    { headers: authHeaders() }
  );
  if (hRes.status() !== 200) return false;
  const hist = (await hRes.json()) ?? [];
  return hist.some(r => {
    if (!r.fecha_hora_fin) return true;
    return new Date(r.fecha_hora_fin.replace(' ', 'T')) > now;
  });
}

// Busca el primer vinculable del principal que no tenga historial conflictivo.
async function findCleanVinculable(request, principalId, excludeIds = []) {
  const vinRes = await request.get(
    `${API_BASE}/moviles/vinculables-select?movil_id=${principalId}`,
    { headers: authHeaders() }
  );
  if (vinRes.status() !== 200) return null;
  const vinculables = (await vinRes.json()) ?? [];
  for (const vin of vinculables.slice(0, 20)) {
    if (excludeIds.includes(vin.id)) continue;
    if (await hasConflictingHistory(request, vin.id)) continue;
    return vin;
  }
  return null;
}

// Busca un móvil libre que tenga al menos un vinculable disponible sin historial conflictivo.
async function findPrincipalConVinculables(request) {
  const listRes = await request.get(
    `${API_BASE}/moviles/newGrid?page=0&perPage=20`,
    { headers: authHeaders() }
  );
  const lista = (await listRes.json()).moviles ?? [];

  for (const m of lista) {
    if (!m.dominio) continue;
    const state = await getActiva(request, m.id);
    if (state?.como_principal?.length || state?.como_asociado) continue;

    const vin = await findCleanVinculable(request, m.id);
    if (vin) return { id: m.id, dominio: m.dominio, vinculables: [vin] };
  }
  return null;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe.serial('VEC-3022 — Importador: columna Activo Asociado', () => {

  test.setTimeout(120000);

  test.beforeAll(async ({ request }) => {
    test.setTimeout(120000);
    token = await login(request);

    const principal = await findPrincipalConVinculables(request);
    expect(principal, 'No se encontró un móvil libre con vinculables disponibles').not.toBeNull();

    principalId      = principal.id;
    principalDominio = principal.dominio;

    // Tomar el primer vinculable como asociado y obtener su dominio
    const vinId = principal.vinculables[0].id;
    const mRes  = await request.get(`${API_BASE}/moviles/${vinId}`, { headers: authHeaders() });
    expect(mRes.status()).toBe(200);
    asociadoId      = vinId;
    asociadoDominio = (await mRes.json()).dominio;

    // Obtener datos del tipo SEDAN para TC-04 (temporarily set pv=false durante el test)
    const tipoRes = await request.get(`${API_BASE}/modelo-tipos/1`, { headers: authHeaders() });
    if (tipoRes.status() === 200) sedanTipoData = await tipoRes.json();
  });

  test.afterAll(async ({ request }) => {
    if (principalId) await closeSilently(request, principalId);
  });

  // ── TC-01 | Importar con Activo Asociado válido ────────────────────────────

  test('TC-01 | Activo Asociado válido → relación creada con origen=importador', async ({ request }) => {
    const res = await importarExcel(request, principalDominio, asociadoDominio);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(filasConError(body)).toBe(0);

    const state = await getActiva(request, principalId);
    const rel   = state?.como_principal?.[0];
    expect(rel, 'No se creó relación activa para el principal').toBeDefined();
    expect(rel.activo_asociado_id).toBe(asociadoId);
    expect(rel.origen_creacion).toBe('importador');
  });

  // ── TC-02 | Importar sin Activo Asociado ──────────────────────────────────

  test('TC-02 | Activo Asociado vacío → importación exitosa, sin cambios en relaciones', async ({ request }) => {
    // Cerrar relación de TC-01 para tener estado limpio
    await closeSilently(request, principalId);

    const res = await importarExcel(request, principalDominio, '');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(filasConError(body)).toBe(0);

    // La columna vacía no dispara sincronizar() → relación sin cambios (sigue sin relación activa)
    const state = await getActiva(request, principalId);
    expect(state?.como_principal?.length ?? 0).toBe(0);
  });

  // ── TC-03 | Activo Asociado con dominio inexistente ───────────────────────

  test('TC-03 | Activo Asociado inexistente → filas_fallaron con error descriptivo', async ({ request }) => {
    const res = await importarExcel(request, principalDominio, 'DOMINIO_INEXISTENTE_QA999');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(filasConError(body)).toBeGreaterThan(0);
    expect(errorsDe(body)).toMatch(/activo asociado no existe|DOMINIO_INEXISTENTE_QA999/i);
  });

  // ── TC-04 | Activo Asociado sin permite_vinculacion ───────────────────────

  test('TC-04 | Activo Asociado con permite_vinculacion=0 → filas_fallaron con error', async ({ request }) => {
    if (!sedanTipoData) {
      test.skip(true, 'No se pudo obtener datos del tipo SEDAN para configurar el test');
      return;
    }

    // Poner tipo SEDAN con pv=false para que asociadoDominio sea no-vinculable
    await request.put(`${API_BASE}/modelo-tipos/1`, {
      data:    { ...sedanTipoData, permite_vinculacion: false },
      headers: authHeaders(),
    });

    try {
      const res = await importarExcel(request, principalDominio, asociadoDominio);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(filasConError(body)).toBeGreaterThan(0);
      expect(errorsDe(body)).toMatch(/no permite vinculaci[oó]n/i);
    } finally {
      // Restaurar pv=true independientemente del resultado
      await request.put(`${API_BASE}/modelo-tipos/1`, {
        data:    { ...sedanTipoData, permite_vinculacion: true },
        headers: authHeaders(),
      });
    }
  });

  // ── TC-05 | Principal ya tiene asociado → importador reasigna al nuevo ───

  test('TC-05 | Principal ya vinculado a asociadoA → importar con asociadoB reasigna (cierra vieja, crea nueva)', async ({ request }) => {
    // Crear relación manual: principalId → asociadoId con inicio 2 s en el pasado.
    // Server is Argentina (UTC-3): send local time so sincronizar() can close it (fin > inicio).
    const ahora = new Date(Date.now() - 3 * 3600 * 1000 - 2000).toISOString().slice(0, 19).replace('T', ' ');
    const relViejaRes = await request.post(`${API_BASE}/movil-relaciones`, {
      data: {
        activo_principal_id: principalId,
        activo_asociado_id:  asociadoId,
        fecha_hora_inicio:   ahora,
      },
      headers: authHeaders(),
    });
    expect(relViejaRes.status()).toBe(201);

    // Buscar segundo vinculable sin historial conflictivo (exclude asociadoId que está activo)
    const segundoVin = await findCleanVinculable(request, principalId, [asociadoId]);
    if (!segundoVin) {
      test.skip(true, 'No hay segundo vinculable sin conflicto disponible para TC-05');
      return;
    }
    const mvRes           = await request.get(`${API_BASE}/moviles/${segundoVin.id}`, { headers: authHeaders() });
    const segundoDominio  = (await mvRes.json()).dominio;

    // Importar con el segundo asociado → sincronizar() cierra la vieja y crea la nueva
    const res = await importarExcel(request, principalDominio, segundoDominio);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(filasConError(body)).toBe(0);

    const state = await getActiva(request, principalId);
    const rel   = state?.como_principal?.[0];
    expect(rel, 'No se creó la nueva relación').toBeDefined();
    expect(rel.activo_asociado_id).toBe(segundoVin.id);
    expect(rel.origen_creacion).toBe('importador');

    // El primer asociado debe haber quedado libre (relación vieja cerrada)
    const stateAsociado = await getActiva(request, asociadoId);
    expect(stateAsociado?.como_asociado).toBeFalsy();
  });

  // ── TC-06 | Auto-vinculación ───────────────────────────────────────────────

  test('TC-06 | Activo Asociado = el mismo móvil principal → filas_fallaron con error', async ({ request }) => {
    // cerrar la relación creada en TC-05 para que pase la validación hasta el auto-vínculo
    await closeSilently(request, principalId);

    const res = await importarExcel(request, principalDominio, principalDominio);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(filasConError(body)).toBeGreaterThan(0);
  });

});
