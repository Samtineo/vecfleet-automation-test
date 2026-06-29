// presupuesto-api.js — cliente API + helpers de dominio para el ciclo de vida del
// presupuesto de un ticket correctivo en VecFleet (vec-dev).
//
// Esta suite es E2E a NIVEL API. La UI de la app móvil no es automatizable desde
// acá (requiere emulador/dispositivo). Ver README.md.
//
// Guard de seguridad: SOLO vec-dev. Si BASE no apunta a vec-dev, el módulo lanza.

const https = require('https');

// ── Entorno (vec-dev SOLO) ──────────────────────────────────────────────────
const HOST     = 'vec-dev.vecfleet.io';
const API_PATH = '/ws/Public/index.php/api';
const BASE_URL = `https://${HOST}${API_PATH}`;

if (!/^https:\/\/vec-dev\.vecfleet\.io\//.test(BASE_URL)) {
  throw new Error('ALERTA: el entorno detectado NO es vec-dev. Ejecucion detenida.');
}

// Credenciales de QA (usuario stineo). Mismo par que usa el resto del repo.
const CREDENTIALS = { username: 'stineo', password: 'susy1234' };

// ── Datos de prueba (vec-dev) ───────────────────────────────────────────────
// Items reales de vec-dev usados en escritura de presupuestos:
//   IT_MO  = 32  → "Mano De Obra Default", tipo Mano De Obra, costo_fijo=1 (precio fijo 1000)
//   IT_REP = 1   → "DISCO DE CLUTCH", tipo Producto, costo_fijo=0 (precio libre)
const IT_MO  = 32;
const IT_REP = 1;
const CLASIFICACION_ID = 1; // item_clasificaciones: "Original"

const SERVICIO_ID = 1;

// ── Cliente HTTP ────────────────────────────────────────────────────────────

function apiRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const raw = body != null ? JSON.stringify(body) : null;
    const opts = {
      hostname: HOST,
      path: `${API_PATH}${path}`,
      method,
      headers: {
        ...(token ? { 'Authorization-Token': token } : {}),
        ...(raw ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) } : {}),
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (raw) req.write(raw);
    req.end();
  });
}

async function login() {
  const res = await apiRequest('POST', '/public/auth/login', {
    usuario: CREDENTIALS.username,
    clave:   CREDENTIALS.password,
  });
  if (res.status !== 200) throw new Error(`Login fallo: ${res.status} ${JSON.stringify(res.body)}`);
  const token = res.body?.usuario?.token;
  if (!token) throw new Error('Login OK pero sin token en resp.usuario.token');
  return token;
}

// ── Lectura de estado del ticket / presupuesto ──────────────────────────────

// El estado puede venir como objeto {nombre} o como string.
const nombreEstado = j => (j && (j.estado && (j.estado.nombre || j.estado))) || '?';

async function getEstado(token, ticketId) {
  const r = await apiRequest('GET', `/tickets/${ticketId}`, null, token);
  return nombreEstado(r.body);
}

async function getActions(token, ticketId) {
  const r = await apiRequest('GET', `/tickets/${ticketId}/actions`, null, token);
  return Array.isArray(r.body) ? r.body : [];
}

// items-activos = lo que ve la APP móvil (items + tareas + totales + flags)
async function getItemsActivos(token, ticketId) {
  return apiRequest('GET', `/ticket-presupuestos/ticket/${ticketId}/items-activos`, null, token);
}

// grid = lo que ve la WEB (lista de presupuestos del ticket)
async function getGrid(token, ticketId) {
  const r = await apiRequest('GET', `/ticket-presupuestos/ticket/${ticketId}/grid`, null, token);
  return Array.isArray(r.body) ? r.body : [];
}

// ── Construcción de items y bodies de escritura ─────────────────────────────
// Shape de ESCRITURA autoritativo (del Repository): `costo` (NO `precio`),
// `id_clasificacion` (NO `id_item_clasificacion`).

function itemMO(costo = 1000) {
  return { id_item: IT_MO, descripcion: 'MO Default', cantidad: 1, costo,
    id_clasificacion: CLASIFICACION_ID, external_code: null, servicio_id: null,
    cuenta_mayor: null, marca: null };
}

function itemRepuesto(costo = 1500) {
  return { id_item: IT_REP, descripcion: 'DISCO DE CLUTCH', cantidad: 1, costo,
    id_clasificacion: CLASIFICACION_ID, external_code: null, servicio_id: null,
    cuenta_mayor: null, marca: null };
}

function bodyPresupuesto(items, adicional = false) {
  let totMO = 0, totRep = 0;
  for (const it of items) {
    if (it.id_item === IT_MO) totMO += it.cantidad * it.costo;
    else totRep += it.cantidad * it.costo;
  }
  return {
    manoDeObra: totMO, repuestos: totRep, impuestos: 0, otros: 0,
    adicional: !!adicional, presupuestoItems: items, presupuestoTareas: [],
  };
}

// Enviar = grabar y promover el presupuesto (transiciona el ticket).
async function enviarPresupuesto(token, ticketId, items, adicional = false, idPresupuesto = null) {
  const body = bodyPresupuesto(items, adicional);
  if (idPresupuesto) body.idPresupuesto = idPresupuesto;
  return apiRequest('POST', `/ticket-presupuestos/ticket/${ticketId}`, body, token);
}

// Borrador = guardar sin enviar (NO transiciona el ticket).
async function guardarBorrador(token, ticketId, items, adicional = false) {
  return apiRequest('POST', `/ticket-presupuestos/ticket/${ticketId}/borrador`, bodyPresupuesto(items, adicional), token);
}

// ── Transiciones de aprobación / rechazo ────────────────────────────────────

// Aprobación completa contemplando el paso de auditor (config aprobacionAuditor ON).
// Devuelve { aprobar, auditor } con los status de cada paso.
async function aprobarCompleto(token, ticketId) {
  const actions = await getActions(token, ticketId);
  let auditor = null;
  if (actions.includes('APROBAR_AUDITOR')) {
    const ra = await apiRequest('POST', `/tickets/aprobar-auditor/${ticketId}`, {}, token);
    auditor = ra.status;
  }
  const aprobar = await apiRequest('POST', `/tickets/aprobar/${ticketId}`, {}, token);
  return { aprobar, auditor };
}

// Rechazo total → manda a recotizar. Elige el endpoint según haya pasado por auditor.
async function rechazarTotal(token, ticketId) {
  const actions = await getActions(token, ticketId);
  const ep = actions.includes('A_RECOTIZAR_AUDITOR')
    ? `/tickets/solicitar-recotizacion-auditor/${ticketId}`
    : `/tickets/solicitar-recotizacion/${ticketId}`;
  const res = await apiRequest('POST', ep, { tipo: 'total' }, token);
  return { ep, res };
}

// Rechazo parcial: cada item lleva estadoRecotizacion 'rechazado'|'aprobado'.
// Los rechazados requieren comentarioRechazo (validacion backend obligatoria).
async function rechazarParcial(token, ticketId, revisiones) {
  const actions = await getActions(token, ticketId);
  const ep = actions.includes('A_RECOTIZAR_AUDITOR')
    ? `/tickets/solicitar-recotizacion-auditor/${ticketId}`
    : `/tickets/solicitar-recotizacion/${ticketId}`;
  const res = await apiRequest('POST', ep, { tipo: 'parcial', revisiones }, token);
  return { ep, res };
}

async function cancelarTicket(token, ticketId) {
  return apiRequest('POST', `/tickets/cancelar/${ticketId}`, { comentario: 'Cleanup QA VEC-3270/3274' }, token);
}

module.exports = {
  HOST, API_PATH, BASE_URL, CREDENTIALS,
  IT_MO, IT_REP, CLASIFICACION_ID, SERVICIO_ID,
  apiRequest, login, getEstado, getActions, getItemsActivos, getGrid,
  itemMO, itemRepuesto, bodyPresupuesto, enviarPresupuesto, guardarBorrador,
  aprobarCompleto, rechazarTotal, rechazarParcial, cancelarTicket,
};
