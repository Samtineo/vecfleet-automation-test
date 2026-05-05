process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');
const fs = require('fs');
const path = require('path');

const DOCS_FILE = path.join(__dirname, '../docs/cancelacion-tickets-inactivacion.md');
const HOST = 'personal-test.vecfleet.io';
const BASE_PATH = '/ws/Public/index.php/api';
const ENTORNO = 'personal-test';

const MOTIVO_CANCELACION = 'Cancelación automática por inactivación de vehículo';

// Test data — personal-test.vecfleet.io
// Movil 23109 (IKA224): tickets PREVENTIVO 488601 + VENCIMIENTO 488602 creados 2026-05-04
// Movil 23110 (PBK646): ticket VENCIMIENTO 488603 creado 2026-05-04 (usado en TC-04)
// Movil 23111 (IJE331): sin tickets activos (usado en TC-07)
const MOVIL_PREVENTIVO_ID  = 23109;
const TICKET_PREVENTIVO_ID = 488601;
const MOVIL_VENCIMIENTO_ID = 23110;
const TICKET_VENCIMIENTO_ID = 488603;
const MOVIL_SIN_TICKETS_ID = 23111;

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

const results = {};
function pass(tc, msg) { results[tc] = 'PASS'; console.log('[PASS] ' + msg); }
function fail(tc, msg) { results[tc] = 'FAIL'; console.log('[FAIL] ' + msg); }
function skip(tc, msg) { results[tc] = 'SKIP'; console.log('[SKIP] ' + msg); }
function info(msg)     { console.log('       ' + msg); }

async function inactivarMovil(movilId, estadoActual, token) {
  return request('PUT', '/moviles/' + movilId + '/estado', { estado: estadoActual, activo: false }, token);
}

async function reactivarMovil(movilId, estadoActual, token) {
  return request('PUT', '/moviles/' + movilId + '/estado', { estado: estadoActual, activo: true }, token);
}

async function main() {
  const login = await request('POST', '/public/auth/login', { usuario: 'stineo', clave: 'susy1234' });
  const token = login.body.token || (login.body.usuario && login.body.usuario.token);
  if (!token) { console.error('Login failed:', JSON.stringify(login.body)); return; }
  info('Login OK — ' + ENTORNO);

  console.log('\n=== VEC-3087 Test Cases — ' + ENTORNO + ' ===');
  console.log('Bug: Preventivos/Vencimientos persisten activos al inactivar móviles');
  console.log('Fix: cancelarPorInactivacionMovil() → cancela tickets abiertos al inactivar si flag habilitado\n');

  // -------------------------------------------------------
  // TC-01: Config flag cancelacionTicketsAlInactivar.habilitado = true
  // -------------------------------------------------------
  console.log('--- TC-01: Config flag cancelacionTicketsAlInactivar habilitado ---');
  const cbRes = await request('GET', '/config-business', null, token);
  const cb = cbRes.body;
  const flagValue = cb && cb.moviles && cb.moviles.cancelacionTicketsAlInactivar
    ? cb.moviles.cancelacionTicketsAlInactivar.habilitado
    : null;
  info('cancelacionTicketsAlInactivar.habilitado = ' + flagValue);
  if (flagValue === 'true' || flagValue === true) {
    pass('tc01', 'TC-01: Config flag habilitado');
  } else {
    fail('tc01', 'TC-01: Flag deshabilitado o no encontrado (valor=' + flagValue + ')');
  }

  // -------------------------------------------------------
  // TC-02: Motivo "Cancelación automática por inactivación de vehículo" existe
  // -------------------------------------------------------
  console.log('\n--- TC-02: Motivo de cancelación existe en el sistema ---');
  const motivosRes = await request('GET',
    '/motivos/simple-search?nombre=' + encodeURIComponent('Cancelaci'), null, token);
  const motivosArr = Array.isArray(motivosRes.body) ? motivosRes.body : [];
  const motivoEncontrado = motivosArr.find(m => m.nombre === MOTIVO_CANCELACION);
  info('Motivos que coinciden con "Cancelaci": ' + motivosArr.length);
  if (motivoEncontrado) {
    pass('tc02', 'TC-02: Motivo existe (id=' + motivoEncontrado.id + ')');
  } else {
    fail('tc02', 'TC-02: Motivo "' + MOTIVO_CANCELACION + '" no encontrado — migración 20260409 no ejecutada');
  }

  if (results.tc01 !== 'PASS' || results.tc02 !== 'PASS') {
    console.log('\n[BLOQUEADO] TC-03 a TC-08 requieren TC-01 y TC-02 en PASS.');
    ['tc03','tc04','tc05','tc06','tc07','tc08'].forEach(tc => { results[tc] = 'SKIP'; });
  } else {

    // -------------------------------------------------------
    // TC-03: Inactivar movil con PREVENTIVO abierto → ticket CANCELADO
    // -------------------------------------------------------
    console.log('\n--- TC-03: Inactivar movil ' + MOVIL_PREVENTIVO_ID + ' con PREVENTIVO ' + TICKET_PREVENTIVO_ID + ' abierto ---');
    const m3Before = await request('GET', '/moviles/' + MOVIL_PREVENTIVO_ID, null, token);
    const estado3 = m3Before.body.estado;
    const tPrevBefore = await request('GET', '/tickets/' + TICKET_PREVENTIVO_ID, null, token);
    info('Ticket ' + TICKET_PREVENTIVO_ID + ' estado antes: ' + tPrevBefore.body.estado);

    if (tPrevBefore.body.estado !== 'ABIERTO') {
      skip('tc03', 'TC-03: Ticket ' + TICKET_PREVENTIVO_ID + ' no está ABIERTO (estado=' + tPrevBefore.body.estado + ') — datos de prueba consumidos, recrear');
    } else {
      const inact3 = await inactivarMovil(MOVIL_PREVENTIVO_ID, estado3, token);
      info('PUT /moviles/' + MOVIL_PREVENTIVO_ID + '/estado activo=false -> status=' + inact3.status);

      if (inact3.status !== 200 && inact3.status !== 204) {
        fail('tc03', 'TC-03: Error al inactivar movil -> status=' + inact3.status + ' | ' + JSON.stringify(inact3.body).substring(0, 200));
      } else {
        await new Promise(r => setTimeout(r, 500));
        const tPrevAfter = await request('GET', '/tickets/' + TICKET_PREVENTIVO_ID, null, token);
        info('Ticket ' + TICKET_PREVENTIVO_ID + ' estado después: ' + tPrevAfter.body.estado);

        if (tPrevAfter.body.estado === 'CANCELADO') {
          pass('tc03', 'TC-03: Ticket PREVENTIVO ' + TICKET_PREVENTIVO_ID + ' cancelado al inactivar movil ' + MOVIL_PREVENTIVO_ID);
        } else {
          fail('tc03', 'TC-03: Ticket PREVENTIVO sigue en estado ' + tPrevAfter.body.estado + ' (esperado CANCELADO)');
        }
      }

      const react3 = await reactivarMovil(MOVIL_PREVENTIVO_ID, estado3, token);
      info('Restaurando movil ' + MOVIL_PREVENTIVO_ID + ' activo=true -> status=' + react3.status);
    }

    // -------------------------------------------------------
    // TC-04: Inactivar movil con VENCIMIENTO abierto → ticket CANCELADO
    // -------------------------------------------------------
    console.log('\n--- TC-04: Inactivar movil ' + MOVIL_VENCIMIENTO_ID + ' con VENCIMIENTO ' + TICKET_VENCIMIENTO_ID + ' abierto ---');
    const m4Before = await request('GET', '/moviles/' + MOVIL_VENCIMIENTO_ID, null, token);
    const estado4 = m4Before.body.estado;
    const tVencBefore = await request('GET', '/tickets/' + TICKET_VENCIMIENTO_ID, null, token);
    info('Ticket ' + TICKET_VENCIMIENTO_ID + ' estado antes: ' + tVencBefore.body.estado);

    if (tVencBefore.body.estado !== 'ABIERTO') {
      skip('tc04', 'TC-04: Ticket ' + TICKET_VENCIMIENTO_ID + ' no está ABIERTO (estado=' + tVencBefore.body.estado + ') — datos de prueba consumidos, recrear');
    } else {
      const inact4 = await inactivarMovil(MOVIL_VENCIMIENTO_ID, estado4, token);
      info('PUT /moviles/' + MOVIL_VENCIMIENTO_ID + '/estado activo=false -> status=' + inact4.status);

      if (inact4.status !== 200 && inact4.status !== 204) {
        fail('tc04', 'TC-04: Error al inactivar movil -> status=' + inact4.status + ' | ' + JSON.stringify(inact4.body).substring(0, 200));
      } else {
        await new Promise(r => setTimeout(r, 500));
        const tVencAfter = await request('GET', '/tickets/' + TICKET_VENCIMIENTO_ID, null, token);
        info('Ticket ' + TICKET_VENCIMIENTO_ID + ' estado después: ' + tVencAfter.body.estado);

        if (tVencAfter.body.estado === 'CANCELADO') {
          pass('tc04', 'TC-04: Ticket VENCIMIENTO ' + TICKET_VENCIMIENTO_ID + ' cancelado al inactivar movil ' + MOVIL_VENCIMIENTO_ID);
        } else {
          fail('tc04', 'TC-04: Ticket VENCIMIENTO sigue en estado ' + tVencAfter.body.estado + ' (esperado CANCELADO)');
        }
      }

      const react4 = await reactivarMovil(MOVIL_VENCIMIENTO_ID, estado4, token);
      info('Restaurando movil ' + MOVIL_VENCIMIENTO_ID + ' activo=true -> status=' + react4.status);
    }

    // -------------------------------------------------------
    // TC-05: Comentario automático en ticket cancelado
    // -------------------------------------------------------
    console.log('\n--- TC-05: Comentario automático en ticket cancelado ---');
    const refTicketId = TICKET_PREVENTIVO_ID;
    const comRes = await request('GET',
      '/ticket-comentarios/ticket/' + refTicketId + '/grid', null, token);
    const comentarios = Array.isArray(comRes.body) ? comRes.body : (comRes.body.data || []);
    const comentarioAuto = comentarios.find(c => (c.comentario || '').includes(MOTIVO_CANCELACION));
    info('Comentarios en ticket ' + refTicketId + ': ' + comentarios.length);
    if (comentarioAuto) {
      pass('tc05', 'TC-05: Comentario automático presente en ticket ' + refTicketId);
    } else if (results.tc03 !== 'PASS') {
      skip('tc05', 'TC-05: TC-03 no pasó — ticket puede no estar cancelado');
    } else {
      fail('tc05', 'TC-05: Comentario "' + MOTIVO_CANCELACION + '" no encontrado en ticket ' + refTicketId);
    }

    // -------------------------------------------------------
    // TC-06: Motivo de cancelación asignado al ticket
    // -------------------------------------------------------
    console.log('\n--- TC-06: Motivo de cancelación asignado al ticket ---');
    const tRes = await request('GET', '/tickets/' + refTicketId, null, token);
    const motivoCancelacion = tRes.body.motivoCancelacion || tRes.body.motivo_cancelacion;
    const motivoNombre = typeof motivoCancelacion === 'object'
      ? (motivoCancelacion && motivoCancelacion.nombre)
      : motivoCancelacion;
    info('Ticket ' + refTicketId + ' motivoCancelacion=' + JSON.stringify(motivoCancelacion));
    if (motivoCancelacion) {
      pass('tc06', 'TC-06: Motivo de cancelación asignado (id/nombre=' + (motivoNombre || motivoCancelacion) + ')');
    } else if (results.tc03 !== 'PASS') {
      skip('tc06', 'TC-06: TC-03 no pasó — no hay ticket cancelado de referencia');
    } else {
      fail('tc06', 'TC-06: Motivo de cancelación NO asignado al ticket ' + refTicketId);
    }

    // -------------------------------------------------------
    // TC-07: Inactivar movil SIN tickets activos → sin error
    // -------------------------------------------------------
    console.log('\n--- TC-07: Inactivar movil ' + MOVIL_SIN_TICKETS_ID + ' sin tickets activos ---');
    const m7Before = await request('GET', '/moviles/' + MOVIL_SIN_TICKETS_ID, null, token);
    const estado7 = m7Before.body.estado;
    const inact7 = await inactivarMovil(MOVIL_SIN_TICKETS_ID, estado7, token);
    info('PUT /moviles/' + MOVIL_SIN_TICKETS_ID + '/estado activo=false -> status=' + inact7.status);
    if (inact7.status === 200 || inact7.status === 204) {
      pass('tc07', 'TC-07: Inactivación sin tickets activos OK (status=' + inact7.status + ')');
    } else {
      fail('tc07', 'TC-07: Error al inactivar movil sin tickets -> status=' + inact7.status + ' | ' + JSON.stringify(inact7.body).substring(0, 200));
    }
    const react7 = await reactivarMovil(MOVIL_SIN_TICKETS_ID, estado7, token);
    info('Restaurando movil ' + MOVIL_SIN_TICKETS_ID + ' activo=true -> status=' + react7.status);

    // -------------------------------------------------------
    // TC-08: Reactivar movil → activo=true correcto
    // -------------------------------------------------------
    console.log('\n--- TC-08: Movil reactivado tiene activo=true ---');
    const movilFinal = await request('GET', '/moviles/' + MOVIL_PREVENTIVO_ID, null, token);
    const activoFinal = movilFinal.body.activo;
    info('Movil ' + MOVIL_PREVENTIVO_ID + ' activo=' + activoFinal + ' (esperado: true/1)');
    if (activoFinal === true || activoFinal === 1 || activoFinal === '1') {
      pass('tc08', 'TC-08: Movil reactivado correctamente (activo=' + activoFinal + ')');
    } else {
      fail('tc08', 'TC-08: Movil NO fue reactivado (activo=' + activoFinal + ')');
    }
  }

  // --- Resumen final ---
  console.log('\n=== Resumen de ejecución ===');
  console.log('Entorno: ' + ENTORNO);
  const tcKeys = ['tc01','tc02','tc03','tc04','tc05','tc06','tc07','tc08'];
  console.log('Resultados: ' + tcKeys.map(k => k.toUpperCase() + '=' + (results[k]||'SKIP')).join(' | '));
  const fails  = tcKeys.filter(k => results[k] === 'FAIL').length;
  const passes = tcKeys.filter(k => results[k] === 'PASS').length;
  const skips  = tcKeys.filter(k => !results[k] || results[k] === 'SKIP').length;
  console.log('PASS=' + passes + ' FAIL=' + fails + ' SKIP=' + skips);

  appendRunToDoc(results);
}

function appendRunToDoc(results) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const row = `| ${today} | ${ENTORNO} | ${['tc01','tc02','tc03','tc04','tc05','tc06','tc07','tc08'].map(k => results[k]||'SKIP').join(' | ')} |`;
    let doc = fs.readFileSync(DOCS_FILE, 'utf8');
    doc = doc.replace(
      /(\| Fecha \| Entorno[\s\S]*?\n)([\s\S]*?)(\n---|\n\n##)/,
      (_, header, body, tail) => header + body + row + '\n' + tail
    );
    fs.writeFileSync(DOCS_FILE, doc, 'utf8');
    console.log('\n[DOC] Resultado registrado en docs/cancelacion-tickets-inactivacion.md');
  } catch (e) {
    console.log('\n[DOC] No se pudo actualizar la doc:', e.message);
  }
}

main().catch(e => console.error('ERR:', e.message));
