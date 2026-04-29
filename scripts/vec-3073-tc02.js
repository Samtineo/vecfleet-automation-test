process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');
const XLSX = require('xlsx');

const HOST = 'vec-dev.vecfleet.io';
const BASE_PATH = '/ws/Public/index.php/api';

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

function requestMultipart(path, fileBuffer, filename, token) {
  return new Promise((resolve, reject) => {
    const boundary = '----VecFleetBoundary' + Date.now().toString(16);
    const part1 = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
    );
    const part2 = Buffer.from(`\r\n--${boundary}--\r\n`);
    const bodyBuf = Buffer.concat([part1, fileBuffer, part2]);

    const headers = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': bodyBuf.length,
    };
    if (token) headers['Authorization-Token'] = token;

    const req = https.request({
      hostname: HOST, path: BASE_PATH + path, method: 'POST', headers, rejectUnauthorized: false
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch (e) { resolve({ status: res.statusCode, body: data }); } });
    });
    req.on('error', reject);
    req.write(bodyBuf);
    req.end();
  });
}

function buildExcel(rows) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'personas');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function pass(msg) { console.log('[PASS] ' + msg); }
function fail(msg) { console.log('[FAIL] ' + msg); }
function info(msg) { console.log('       ' + msg); }

// Test data
const PERFIL_VALIDO = 'ABInBev-Procurement';
const BASE_VALIDA   = 'BASE DEFAULT';
const BASE_INVALIDA = 'BASE_INEXISTENTE_QA';
const TS = Date.now();

async function main() {
  const login = await request('POST', '/public/auth/login', { usuario: 'stineo', clave: 'susy1234' });
  const token = login.body.usuario.token;
  console.log('=== VEC-3073 TC-02 — Importador mixto: filas válidas + 1 inválida ===\n');

  // Build Excel: header + 2 valid rows + 1 invalid row
  const rows = [
    ['nombre', 'apellido', 'documento_tipo', 'documento_numero', 'es_activo', 'es_usuario', 'usuario', 'perfil', 'email', 'notificaciones_activas', 'base'],
    ['QA Valida1', 'VEC3073',  'DNI', '10000001', 'SI', 'SI', 'qa.valida1.' + TS, PERFIL_VALIDO, 'qa.valida1.' + TS + '@vecfleet.io', 'SI', BASE_VALIDA],
    ['QA Valida2', 'VEC3073',  'DNI', '10000002', 'SI', 'SI', 'qa.valida2.' + TS, PERFIL_VALIDO, 'qa.valida2.' + TS + '@vecfleet.io', 'SI', BASE_VALIDA],
    ['QA Invalida', 'BaseErr', 'DNI', '10000003', 'SI', 'NO', '',                  '',            '',                                   'NO', BASE_INVALIDA],
  ];

  const xlsxBuf = buildExcel(rows);
  info('Excel generado: ' + (rows.length - 1) + ' filas de datos (2 válidas, 1 inválida)');
  info('Enviando POST /personas/importar-excel ...');

  const res = await requestMultipart('/personas/importar-excel', xlsxBuf, 'test-vec-3073.xlsx', token);
  info('HTTP status: ' + res.status);
  info('Response: ' + JSON.stringify(res.body));

  const stats    = res.body.stats || {};
  const errores  = res.body.errores || [];
  const advertencias = res.body.advertencias || [];

  const personasCreadas = parseInt(stats.personas_creadas) || 0;
  const usuariosCreados = parseInt(stats.usuarios_creados) || 0;
  const hayErrorBase    = errores.some(e => e.error && e.error.includes(BASE_INVALIDA));

  console.log('\n--- Resultados ---');
  info('personas_procesadas: ' + stats.personas_procesadas);
  info('personas_creadas:    ' + personasCreadas + ' (esperado ≥ 2)');
  info('usuarios_creados:    ' + usuariosCreados + ' (esperado ≥ 2 — fix de VEC-3073)');
  info('errores:             ' + errores.length + ' (esperado 1)');
  info('advertencias:        ' + advertencias.length);

  console.log('');

  // Core assertion: fix ensures users are created for valid rows despite errors in other rows
  if (personasCreadas >= 2 && usuariosCreados >= 2 && hayErrorBase) {
    pass('TC-02: Filas válidas crearon persona Y usuario. Fila inválida registrada como error. Fix VEC-3073 OK.');
  } else if (personasCreadas >= 2 && usuariosCreados === 0) {
    fail('TC-02: Personas creadas (' + personasCreadas + ') pero usuarios_creados=0 — fix NO aplicado o regresión.');
  } else if (personasCreadas >= 2 && usuariosCreados > 0 && !hayErrorBase) {
    fail('TC-02: Usuarios creados pero el error de fila inválida no fue reportado correctamente.');
  } else {
    fail('TC-02: Resultado inesperado — personas_creadas=' + personasCreadas + ', usuarios_creados=' + usuariosCreados + ', errores=' + errores.length);
  }
}

main().catch(e => console.error('ERR:', e.message));
