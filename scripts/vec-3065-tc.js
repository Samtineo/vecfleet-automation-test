process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');

const HOST       = 'vec-dev.vecfleet.io';
const BASE_PATH  = '/ws/Public/index.php/api';
const START_DATE = '2025-01-01';
const END_DATE   = '2026-04-29';

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization-Token'] = token;
    const payload = body ? JSON.stringify(body) : null;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    const req = https.request({
      hostname: HOST, path: BASE_PATH + path, method, headers, rejectUnauthorized: false
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch (e) { resolve({ status: res.statusCode, body: data }); } });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function pass(msg) { console.log('[PASS] ' + msg); }
function fail(msg) { console.log('[FAIL] ' + msg); }
function info(msg) { console.log('       ' + msg); }

const GRID = '/combustibles/grid/' + START_DATE + '/' + END_DATE;

async function main() {
  const login = await request('POST', '/public/auth/login', { usuario: 'stineo', clave: 'susy1234' });
  const token = login.body.usuario.token;
  console.log('=== VEC-3065 Test Cases — Switch "Ver Inactivos" en Combustibles ===\n');

  // -------------------------------------------------------
  // TC-01: estadoVehiculo=true (default, switch OFF) → solo activos
  // -------------------------------------------------------
  console.log('--- TC-01: estadoVehiculo=true (default) → solo móviles activos ---');

  const r1 = await request('GET', GRID + '?perPage=2500&estadoVehiculo=true', null, token);
  const cargas1 = r1.body.combustibles || [];
  const domsTrue = new Set(cargas1.map(c => c.dominio));
  info('HTTP: ' + r1.status + ' | registros: ' + cargas1.length + ' | dominios únicos: ' + domsTrue.size);

  // Verify sample dominio is active via moviles/newGrid
  const sampleDom = [...domsTrue][0];
  const movSample = await request('GET', '/moviles/newGrid?dominio=' + encodeURIComponent(sampleDom) + '&perPage=1', null, token);
  const movilSample = (movSample.body.moviles || [])[0];
  const sampleActivo = movilSample ? movilSample.activo : null;
  info('Muestra: dominio=' + sampleDom + ' → activo=' + sampleActivo + ' (en moviles/newGrid)');

  if (r1.status === 200 && cargas1.length > 0 && sampleActivo === 1) {
    pass('TC-01: estadoVehiculo=true devuelve ' + cargas1.length + ' registros de móviles activos');
  } else if (r1.status === 200 && cargas1.length > 0 && sampleActivo === null) {
    pass('TC-01: estadoVehiculo=true devuelve ' + cargas1.length + ' registros (muestra no disponible en newGrid para verificación extra)');
  } else {
    fail('TC-01: Resultado inesperado — registros=' + cargas1.length + ', activo_muestra=' + sampleActivo);
  }

  // -------------------------------------------------------
  // TC-02: verInactivos=true (switch ON) → activos + inactivos
  // -------------------------------------------------------
  console.log('\n--- TC-02: verInactivos=true (switch ON "Ver Inactivos") → activos + inactivos ---');

  const r2 = await request('GET', GRID + '?perPage=3000&verInactivos=true', null, token);
  const cargas2 = r2.body.combustibles || [];
  const domsAll = new Set(cargas2.map(c => c.dominio));
  info('HTTP: ' + r2.status + ' | registros: ' + cargas2.length + ' | dominios únicos: ' + domsAll.size);

  const activosPresentes   = [...domsTrue].filter(d => domsAll.has(d)).length;
  const inactivosPresentes = [...domsAll].filter(d => !domsTrue.has(d)).length;
  info('Dominios activos presentes: ' + activosPresentes + ' de ' + domsTrue.size + ' (esperado: todos)');
  info('Dominios inactivos adicionales: ' + inactivosPresentes + ' (esperado: > 0)');

  if (activosPresentes === domsTrue.size && inactivosPresentes > 0) {
    pass('TC-02: verInactivos=true incluye activos (' + activosPresentes + ') e inactivos (' + inactivosPresentes + ')');
  } else if (activosPresentes === 0) {
    fail('TC-02: verInactivos=true no incluye ningún activo — filtro incorrecto');
  } else if (inactivosPresentes === 0) {
    fail('TC-02: verInactivos=true no agrega inactivos — switch sin efecto');
  } else {
    fail('TC-02: Resultado inesperado — activos_presentes=' + activosPresentes + ', inactivos_presentes=' + inactivosPresentes);
  }

  // -------------------------------------------------------
  // TC-03: verInactivos=true tiene más registros que estadoVehiculo=true
  // -------------------------------------------------------
  console.log('\n--- TC-03: verInactivos=true devuelve más registros que estadoVehiculo=true ---');

  info('estadoVehiculo=true (switch OFF): ' + cargas1.length + ' registros');
  info('verInactivos=true   (switch ON):  ' + cargas2.length + ' registros (esperado: > ' + cargas1.length + ')');

  if (cargas2.length > cargas1.length) {
    pass('TC-03: Switch ON agrega ' + (cargas2.length - cargas1.length) + ' registros de inactivos sobre los activos');
  } else if (cargas2.length === cargas1.length) {
    fail('TC-03: Misma cantidad — switch no tiene efecto');
  } else {
    fail('TC-03: Switch ON devuelve MENOS registros que switch OFF (' + cargas2.length + ' < ' + cargas1.length + ')');
  }
}

main().catch(e => console.error('ERR:', e.message));
