process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DOCS_FILE = path.join(__dirname, '../docs/checklist-hora-inicio-fin.md');
const HOST = 'vec-hotfix.vecfleet.io';
const BASE_PATH = '/ws/Public/index.php/api';
const ENTORNO = 'vec-hotfix';

// Test data: formularios tipo=3, ids 36-40, creados 2026-04-01/07
// Todos tienen fecha_inicio y fecha_fin no nulas.
const TIPO_FORMULARIO_ID = 3;
const FECHA_DESDE = '2026-03-31';
const FECHA_HASTA = '2026-04-08';
const FORMULARIOS_CON_HORA = [36, 37, 38, 39, 40];

function request(method, reqPath, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization-Token'] = token;
    const payload = body ? JSON.stringify(body) : null;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    const req = https.request({
      hostname: HOST, path: BASE_PATH + reqPath, method, headers, rejectUnauthorized: false
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function requestBinary(method, reqPath, params, token) {
  return new Promise((resolve, reject) => {
    // POST with application/x-www-form-urlencoded for export params
    const payload = new URLSearchParams(params).toString();
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(payload)
    };
    if (token) headers['Authorization-Token'] = token;
    const req = https.request({
      hostname: HOST, path: BASE_PATH + reqPath, method, headers, rejectUnauthorized: false
    }, (res) => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const results = {};
function pass(tc, msg) { results[tc] = 'PASS'; console.log('[PASS] ' + msg); }
function fail(tc, msg) { results[tc] = 'FAIL'; console.log('[FAIL] ' + msg); }
function skip(tc, msg) { results[tc] = 'SKIP'; console.log('[SKIP] ' + msg); }
function info(msg)     { console.log('       ' + msg); }

async function main() {
  const login = await request('POST', '/public/auth/login', { usuario: 'stineo', clave: 'susy1234' });
  const token = login.body.token || (login.body.usuario && login.body.usuario.token);
  if (!token) { console.error('Login failed:', JSON.stringify(login.body)); return; }
  info('Login OK — ' + ENTORNO);

  console.log('\n=== VEC-2998 Test Cases — ' + ENTORNO + ' ===');
  console.log('Bug: Export de Checklist trae columnas Hora Inicio y Hora Fin vacias');
  console.log('Fix: ExcelService convierte correctamente fechas tipo HHMM al formato Excel\n');

  // -------------------------------------------------------
  // TC-01: Formularios con fecha_inicio y fecha_fin existen
  // -------------------------------------------------------
  console.log('--- TC-01: Formularios de prueba tienen fecha_inicio y fecha_fin no nulas ---');
  let encontrados = 0;
  for (const id of FORMULARIOS_CON_HORA) {
    const f = await request('GET', '/formulario/' + id, null, token);
    if (f.status === 200 && f.body.fecha_inicio && f.body.fecha_fin) {
      encontrados++;
      info('Formulario ' + id + ': fecha_inicio=' + f.body.fecha_inicio + ' | fecha_fin=' + f.body.fecha_fin);
    } else {
      info('Formulario ' + id + ': status=' + f.status + ' fecha_inicio=' + (f.body.fecha_inicio || 'NULL'));
    }
  }
  if (encontrados === FORMULARIOS_CON_HORA.length) {
    pass('tc01', 'TC-01: ' + encontrados + '/' + FORMULARIOS_CON_HORA.length + ' formularios tienen fecha_inicio y fecha_fin');
  } else if (encontrados > 0) {
    pass('tc01', 'TC-01: ' + encontrados + '/' + FORMULARIOS_CON_HORA.length + ' formularios tienen fecha_inicio y fecha_fin (suficiente para QA)');
  } else {
    fail('tc01', 'TC-01: No se encontraron formularios con fecha_inicio/fecha_fin en el entorno');
  }

  // -------------------------------------------------------
  // TC-02: Export devuelve archivo Excel válido (no error)
  // -------------------------------------------------------
  console.log('\n--- TC-02: POST /formulario/exportar-excel devuelve xlsx válido ---');
  const exportParams = {
    tipoFormulario: String(TIPO_FORMULARIO_ID),
    fechaDesde: FECHA_DESDE,
    fechaHasta: FECHA_HASTA,
  };
  const exportRes = await requestBinary('POST', '/formulario/exportar-excel', exportParams, token);
  info('Export status: ' + exportRes.status + ' | Content-Type: ' + exportRes.contentType + ' | Size: ' + exportRes.buffer.length + ' bytes');

  if (exportRes.status !== 200 || exportRes.buffer.length < 1000) {
    fail('tc02', 'TC-02: Export falló o devolvió archivo muy pequeño (status=' + exportRes.status + ' size=' + exportRes.buffer.length + ')');
    info('Body preview: ' + exportRes.buffer.toString('utf8').substring(0, 300));
    ['tc03','tc04','tc05'].forEach(tc => skip(tc, tc + ': Bloqueado por TC-02 FAIL'));
  } else {
    pass('tc02', 'TC-02: Export devolvió archivo xlsx (' + exportRes.buffer.length + ' bytes)');

    // Parse xlsx
    let workbook, sheet, rows;
    try {
      workbook = XLSX.read(exportRes.buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'hh:mm' });
      info('Filas en export: ' + rows.length + ' | Columnas: ' + (rows[0] && rows[0].length));
    } catch (e) {
      fail('tc03', 'TC-03: Error al parsear xlsx: ' + e.message);
      ['tc04','tc05'].forEach(tc => skip(tc, tc + ': Bloqueado por error de parse'));
      rows = null;
    }

    if (rows) {
      const headers = rows[0] || [];
      info('Encabezados: ' + headers.join(' | '));

      // -------------------------------------------------------
      // TC-03: Columnas Hora Inicio y Hora Fin existen en el export
      // -------------------------------------------------------
      console.log('\n--- TC-03: Export incluye columnas Hora Inicio y Hora Fin ---');
      const horaInicioIdx = headers.findIndex(h => h && h.toLowerCase().includes('hora inicio'));
      const horaFinIdx    = headers.findIndex(h => h && h.toLowerCase().includes('hora fin'));
      info('Columna "Hora Inicio" en idx=' + horaInicioIdx + ' | "Hora Fin" en idx=' + horaFinIdx);

      if (horaInicioIdx >= 0 && horaFinIdx >= 0) {
        pass('tc03', 'TC-03: Columnas "Hora Inicio" y "Hora Fin" presentes en el export');
      } else {
        fail('tc03', 'TC-03: Columnas faltantes — horaInicio=' + horaInicioIdx + ' horaFin=' + horaFinIdx);
        skip('tc04', 'TC-04: Bloqueado por TC-03 FAIL');
        skip('tc05', 'TC-05: Bloqueado por TC-03 FAIL');
      }

      if (horaInicioIdx >= 0 && horaFinIdx >= 0) {
        // -------------------------------------------------------
        // TC-04: Columnas Hora Inicio y Hora Fin tienen valores (no vacías)
        // -------------------------------------------------------
        console.log('\n--- TC-04: Hora Inicio y Hora Fin tienen valores en las filas de datos ---');
        const dataRows = rows.slice(1);
        let filasConHora = 0;
        let filasVacias = 0;

        for (const row of dataRows) {
          const hi = row[horaInicioIdx];
          const hf = row[horaFinIdx];
          const id = row[0];
          if (hi && hf) {
            filasConHora++;
            info('ID=' + id + ' | Hora Inicio=' + hi + ' | Hora Fin=' + hf);
          } else {
            filasVacias++;
            info('ID=' + id + ' | Hora Inicio=' + (hi || 'VACÍO') + ' | Hora Fin=' + (hf || 'VACÍO'));
          }
        }

        info('Filas con hora: ' + filasConHora + ' | Filas vacías: ' + filasVacias + ' | Total datos: ' + dataRows.length);

        if (filasConHora > 0 && filasVacias === 0) {
          pass('tc04', 'TC-04: Todas las filas tienen Hora Inicio y Hora Fin pobladas (' + filasConHora + ')');
        } else if (filasConHora > 0) {
          fail('tc04', 'TC-04: ' + filasVacias + ' filas tienen Hora Inicio/Fin vacías (puede ser data sin fecha_inicio)');
        } else {
          fail('tc04', 'TC-04: Ninguna fila tiene Hora Inicio/Fin — bug persiste');
        }

        // -------------------------------------------------------
        // TC-05: Formato de hora es HH:MM (no serial Excel ni timestamp)
        // -------------------------------------------------------
        console.log('\n--- TC-05: Formato de hora es legible (HH:MM) ---');
        const dataConHora = dataRows.filter(r => r[horaInicioIdx]);
        if (dataConHora.length === 0) {
          skip('tc05', 'TC-05: No hay filas con hora para verificar formato');
        } else {
          const sampleHora = dataConHora[0][horaInicioIdx];
          info('Muestra hora: "' + sampleHora + '"');
          // Valid: "10:30", "10:30:00", a Date string — all acceptable
          // Invalid: a raw number like "0.4375" (Excel serial fraction) or empty
          const isNumericOnly = /^\d+(\.\d+)?$/.test(String(sampleHora).trim());
          if (isNumericOnly) {
            fail('tc05', 'TC-05: Hora exportada como serial numérico ("' + sampleHora + '") — no legible en Excel');
          } else {
            pass('tc05', 'TC-05: Hora exportada en formato legible ("' + sampleHora + '")');
          }
        }
      }
    }
  }

  // --- Resumen final ---
  console.log('\n=== Resumen de ejecución ===');
  console.log('Entorno: ' + ENTORNO);
  const tcKeys = ['tc01','tc02','tc03','tc04','tc05'];
  console.log('Resultados: ' + tcKeys.map(k => k.toUpperCase() + '=' + (results[k]||'SKIP')).join(' | '));
  const fails  = tcKeys.filter(k => results[k] === 'FAIL').length;
  const passes = tcKeys.filter(k => results[k] === 'PASS').length;
  console.log('PASS=' + passes + ' FAIL=' + fails + ' SKIP=' + tcKeys.filter(k => !results[k] || results[k] === 'SKIP').length);

  appendRunToDoc(results);
}

function appendRunToDoc(results) {
  try {
    if (!fs.existsSync(DOCS_FILE)) return;
    const today = new Date().toISOString().slice(0, 10);
    const row = `| ${today} | ${ENTORNO} | ${['tc01','tc02','tc03','tc04','tc05'].map(k => results[k]||'SKIP').join(' | ')} |`;
    let doc = fs.readFileSync(DOCS_FILE, 'utf8');
    doc = doc.replace(
      /(\| Fecha \| Entorno[\s\S]*?\n)([\s\S]*?)(\n---|\n\n##|$)/,
      (_, header, body, tail) => header + body + row + '\n' + tail
    );
    fs.writeFileSync(DOCS_FILE, doc, 'utf8');
    console.log('\n[DOC] Resultado registrado en docs/checklist-hora-inicio-fin.md');
  } catch (e) {
    console.log('\n[DOC] No se pudo actualizar la doc:', e.message);
  }
}

main().catch(e => console.error('ERR:', e.message));
