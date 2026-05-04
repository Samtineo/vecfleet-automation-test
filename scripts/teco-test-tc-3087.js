process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');

const HOST = 'personal-test.vecfleet.io';
const BASE_PATH = '/ws/Public/index.php/api';
const ENTORNO = 'personal-test';

const MOTIVO_CANCELACION = 'Cancelación automática por inactivación de vehículo';

// Hardcodear IDs si se conocen; el script los busca automáticamente si quedan en null
let MOVIL_CON_PREVENTIVO_ID = null;
let MOVIL_CON_VENCIMIENTO_ID = null;
let MOVIL_SIN_TICKETS_ID = null;

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

async function findMovilConTicketAbierto(tipo, token) {
  const res = await request('GET',
    '/tickets/newGrid?page=0&perPage=20&estado=ABIERTO&ticketTipo=' + tipo, null, token);
  if (res.status !== 200 || !res.body.tickets) return null;
  for (const t of res.body.tickets) {
    const movilId = t.movil;
    if (!movilId) continue;
    const m = await request('GET', '/moviles/' + movilId, null, token);
    if (m.body && (m.body.activo === true || m.body.activo === 1)) {
      return { movilId, ticketId: t.id };
    }
  }
  return null;
}

async function findMovilSinTickets(token) {
  const res = await request('GET', '/moviles/list?activo=1&limit=30&page=1', null, token);
  const moviles = res.body && res.body.moviles ? res.body.moviles : [];
  for (const m of moviles) {
    const tRes = await request('GET',
      '/tickets/newGrid?page=0&perPage=5&movil=' + m.id + '&estado=ABIERTO', null, token);
    if (tRes.status === 200 && tRes.body.pagination && tRes.body.pagination.count === 0) {
      return m.id;
    }
  }
  return null;
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
    fail('tc01', 'TC-01: Flag deshabilitado o no encontrado (valor=' + flagValue + ')' +
      (flagValue === null ? ' — clave ausente en config-business, requiere habilitación en DevOps' : ''));
  }

  // -------------------------------------------------------
  // TC-02: Motivo "Cancelación automática por inactivación de vehículo" existe
  // -------------------------------------------------------
  console.log('\n--- TC-02: Motivo de cancelación existe en el sistema ---');
  const motivosRes = await request('GET', '/motivos?tipoMotivo=CANCELACION', null, token);
  // Formato: { motivos: [...] } o array directo
  const motivosArr = motivosRes.body && motivosRes.body.motivos
    ? motivosRes.body.motivos
    : (Array.isArray(motivosRes.body) ? motivosRes.body : []);
  const motivoEncontrado = motivosArr.find(m => m.nombre === MOTIVO_CANCELACION);
  info('Motivos de cancelacion encontrados: ' + motivosArr.length);
  if (motivoEncontrado) {
    pass('tc02', 'TC-02: Motivo existe (id=' + motivoEncontrado.id + ')');
  } else {
    fail('tc02', 'TC-02: Motivo "' + MOTIVO_CANCELACION + '" no encontrado — migración 20260409 no ejecutada en este entorno');
  }

  // Si TC-01 o TC-02 fallan, los TCs funcionales no pueden pasar
  if (results.tc01 !== 'PASS' || results.tc02 !== 'PASS') {
    console.log('\n[BLOQUEADO] TC-03 a TC-08 requieren TC-01 y TC-02 en PASS.');
    console.log('Pendiente: habilitar flag + ejecutar migraciones en ' + ENTORNO);
    ['tc03','tc04','tc05','tc06','tc07','tc08'].forEach(tc => { results[tc] = 'SKIP'; });
  } else {
    // -------------------------------------------------------
    // SETUP: Buscar moviles de prueba si no están hardcodeados
    // -------------------------------------------------------
    console.log('\n--- SETUP: Buscando móviles de prueba ---');
    let preventivoMovilId = MOVIL_CON_PREVENTIVO_ID;
    let preventivoTicketId = null;
    if (!preventivoMovilId) {
      const found = await findMovilConTicketAbierto('PREVENTIVO', token);
      if (found) { preventivoMovilId = found.movilId; preventivoTicketId = found.ticketId; }
    }
    info('Movil con PREVENTIVO abierto: ' + (preventivoMovilId || 'NO ENCONTRADO'));

    let vencimientoMovilId = MOVIL_CON_VENCIMIENTO_ID;
    let vencimientoTicketId = null;
    if (!vencimientoMovilId) {
      const found = await findMovilConTicketAbierto('VENCIMIENTO', token);
      if (found) { vencimientoMovilId = found.movilId; vencimientoTicketId = found.ticketId; }
    }
    info('Movil con VENCIMIENTO abierto: ' + (vencimientoMovilId || 'NO ENCONTRADO'));

    let sinTicketsMovilId = MOVIL_SIN_TICKETS_ID;
    if (!sinTicketsMovilId) sinTicketsMovilId = await findMovilSinTickets(token);
    info('Movil sin tickets activos: ' + (sinTicketsMovilId || 'NO ENCONTRADO'));

    // -------------------------------------------------------
    // TC-03: Inactivar movil con PREVENTIVO abierto → ticket CANCELADO
    // -------------------------------------------------------
    console.log('\n--- TC-03: Inactivar movil con PREVENTIVO abierto ---');
    if (!preventivoMovilId) {
      skip('tc03', 'TC-03: No se encontró movil activo con PREVENTIVO abierto — crear ticket PREVENTIVO de prueba');
    } else {
      const movilBefore = await request('GET', '/moviles/' + preventivoMovilId, null, token);
      const estadoBefore = movilBefore.body.estado;
      const tBeforeRes = await request('GET',
        '/tickets/newGrid?page=0&perPage=50&movil=' + preventivoMovilId + '&estado=ABIERTO', null, token);
      const tBefore = tBeforeRes.body.tickets || [];
      info('Movil ' + preventivoMovilId + ' | estado=' + estadoBefore + ' | tickets activos: ' + tBefore.length);

      const inactRes = await request('PUT', '/moviles/' + preventivoMovilId + '/estado',
        { estado: estadoBefore, activo: false }, token);
      info('PUT /moviles/' + preventivoMovilId + '/estado activo=false -> status=' + inactRes.status);

      if (inactRes.status !== 200 && inactRes.status !== 204) {
        fail('tc03', 'TC-03: Error al inactivar movil -> status=' + inactRes.status);
      } else {
        await new Promise(r => setTimeout(r, 500));
        const tAfterRes = await request('GET',
          '/tickets/newGrid?page=0&perPage=50&movil=' + preventivoMovilId, null, token);
        const tAfterAll = tAfterRes.body.tickets || [];
        const cancelados = tAfterAll.filter(t => t.estado === 'CANCELADO');
        const abiertos = tAfterAll.filter(t => !['CANCELADO','CERRADO'].includes(t.estado));
        info('Tickets cancelados: ' + cancelados.length + ' | abiertos restantes: ' + abiertos.length);
        preventivoTicketId = preventivoTicketId || (cancelados[0] && cancelados[0].id);

        if (tBefore.length > 0 && abiertos.length === 0) {
          pass('tc03', 'TC-03: Todos los tickets activos fueron cancelados (' + cancelados.length + ')');
        } else if (tBefore.length === 0) {
          skip('tc03', 'TC-03: Movil no tenía tickets activos al momento de la inactivacion');
        } else {
          fail('tc03', 'TC-03: Tickets abiertos persisten tras inactivar — antes=' + tBefore.length + ' abiertos=' + abiertos.length);
        }
      }

      const restoreRes = await request('PUT', '/moviles/' + preventivoMovilId + '/estado',
        { estado: estadoBefore, activo: true }, token);
      info('Restaurando movil ' + preventivoMovilId + ' -> activo=true | status=' + restoreRes.status);
    }

    // -------------------------------------------------------
    // TC-04: Inactivar movil con VENCIMIENTO abierto → ticket CANCELADO
    // -------------------------------------------------------
    console.log('\n--- TC-04: Inactivar movil con VENCIMIENTO abierto ---');
    if (!vencimientoMovilId || vencimientoMovilId === preventivoMovilId) {
      skip('tc04', 'TC-04: No se encontró movil distinto con VENCIMIENTO abierto');
    } else {
      const movilBefore = await request('GET', '/moviles/' + vencimientoMovilId, null, token);
      const estadoBefore = movilBefore.body.estado;
      const tBeforeRes = await request('GET',
        '/tickets/newGrid?page=0&perPage=50&movil=' + vencimientoMovilId + '&estado=ABIERTO', null, token);
      const tBefore = tBeforeRes.body.tickets || [];
      info('Movil ' + vencimientoMovilId + ' | tickets activos: ' + tBefore.length);

      const inactRes = await request('PUT', '/moviles/' + vencimientoMovilId + '/estado',
        { estado: estadoBefore, activo: false }, token);
      info('PUT /moviles/' + vencimientoMovilId + '/estado activo=false -> status=' + inactRes.status);

      if (inactRes.status !== 200 && inactRes.status !== 204) {
        fail('tc04', 'TC-04: Error al inactivar movil -> status=' + inactRes.status);
      } else {
        await new Promise(r => setTimeout(r, 500));
        const tAfterRes = await request('GET',
          '/tickets/newGrid?page=0&perPage=50&movil=' + vencimientoMovilId, null, token);
        const tAfterAll = tAfterRes.body.tickets || [];
        const abiertos = tAfterAll.filter(t => !['CANCELADO','CERRADO'].includes(t.estado));
        const cancelados = tAfterAll.filter(t => t.estado === 'CANCELADO');
        vencimientoTicketId = vencimientoTicketId || (cancelados[0] && cancelados[0].id);
        info('Cancelados: ' + cancelados.length + ' | abiertos restantes: ' + abiertos.length);

        if (tBefore.length > 0 && abiertos.length === 0) {
          pass('tc04', 'TC-04: Tickets VENCIMIENTO cancelados correctamente');
        } else if (tBefore.length === 0) {
          skip('tc04', 'TC-04: Movil no tenía tickets activos');
        } else {
          fail('tc04', 'TC-04: Tickets abiertos persisten tras inactivar — antes=' + tBefore.length + ' abiertos=' + abiertos.length);
        }
      }

      const restoreRes = await request('PUT', '/moviles/' + vencimientoMovilId + '/estado',
        { estado: estadoBefore, activo: true }, token);
      info('Restaurando movil ' + vencimientoMovilId + ' -> activo=true | status=' + restoreRes.status);
    }

    // -------------------------------------------------------
    // TC-05: Comentario automático en ticket cancelado
    // -------------------------------------------------------
    console.log('\n--- TC-05: Comentario automático en ticket cancelado ---');
    const ticketParaComentario = preventivoTicketId || vencimientoTicketId;
    if (!ticketParaComentario) {
      skip('tc05', 'TC-05: No hay ticket cancelado de referencia (TC-03/04 deben pasar primero)');
    } else {
      const comRes = await request('GET',
        '/ticket-comentarios/ticket/' + ticketParaComentario + '/grid', null, token);
      const comentarios = Array.isArray(comRes.body) ? comRes.body : (comRes.body.data || []);
      const comentarioAuto = comentarios.find(c => (c.comentario || '').includes(MOTIVO_CANCELACION));
      info('Comentarios en ticket ' + ticketParaComentario + ': ' + comentarios.length);
      if (comentarioAuto) {
        pass('tc05', 'TC-05: Comentario automático presente en ticket ' + ticketParaComentario);
      } else {
        fail('tc05', 'TC-05: Comentario "' + MOTIVO_CANCELACION + '" no encontrado');
      }
    }

    // -------------------------------------------------------
    // TC-06: Motivo de cancelación asignado al ticket
    // -------------------------------------------------------
    console.log('\n--- TC-06: Motivo de cancelación asignado al ticket ---');
    if (!ticketParaComentario) {
      skip('tc06', 'TC-06: No hay ticket cancelado de referencia');
    } else {
      const tRes = await request('GET', '/tickets/' + ticketParaComentario, null, token);
      const motivoCancelacion = tRes.body.motivoCancelacion || tRes.body.motivo_cancelacion;
      const motivoNombre = typeof motivoCancelacion === 'object'
        ? (motivoCancelacion && motivoCancelacion.nombre)
        : motivoCancelacion;
      info('Ticket ' + ticketParaComentario + ' motivoCancelacion=' + JSON.stringify(motivoCancelacion));
      if (motivoCancelacion) {
        pass('tc06', 'TC-06: Motivo de cancelación asignado (id/nombre=' + (motivoNombre || motivoCancelacion) + ')');
      } else {
        fail('tc06', 'TC-06: Motivo de cancelación NO asignado al ticket');
      }
    }

    // -------------------------------------------------------
    // TC-07: Inactivar movil SIN tickets activos → sin error
    // -------------------------------------------------------
    console.log('\n--- TC-07: Inactivar movil sin tickets activos ---');
    if (!sinTicketsMovilId) {
      skip('tc07', 'TC-07: No se encontró movil activo sin tickets');
    } else {
      const movilBefore = await request('GET', '/moviles/' + sinTicketsMovilId, null, token);
      const estadoBefore = movilBefore.body.estado;
      const inactRes = await request('PUT', '/moviles/' + sinTicketsMovilId + '/estado',
        { estado: estadoBefore, activo: false }, token);
      info('PUT /moviles/' + sinTicketsMovilId + '/estado activo=false -> status=' + inactRes.status);
      if (inactRes.status === 200 || inactRes.status === 204) {
        pass('tc07', 'TC-07: Inactivacion sin tickets activos OK (status=' + inactRes.status + ')');
      } else {
        fail('tc07', 'TC-07: Error al inactivar movil sin tickets -> status=' + inactRes.status + ' | ' + JSON.stringify(inactRes.body).substring(0, 200));
      }
      const restoreRes = await request('PUT', '/moviles/' + sinTicketsMovilId + '/estado',
        { estado: estadoBefore, activo: true }, token);
      info('Restaurando movil ' + sinTicketsMovilId + ' -> activo=true | status=' + restoreRes.status);
    }

    // -------------------------------------------------------
    // TC-08: Reactivar movil → activo=true correcto
    // -------------------------------------------------------
    console.log('\n--- TC-08: Reactivar movil vuelve a activo=true ---');
    const movilParaReact = preventivoMovilId || vencimientoMovilId || sinTicketsMovilId;
    if (!movilParaReact) {
      skip('tc08', 'TC-08: No hay movil de referencia');
    } else {
      const movilDespues = await request('GET', '/moviles/' + movilParaReact, null, token);
      const activo = movilDespues.body.activo;
      info('Movil ' + movilParaReact + ' activo=' + activo + ' (esperado: true/1)');
      if (activo === true || activo === 1 || activo === '1') {
        pass('tc08', 'TC-08: Movil reactivado correctamente (activo=' + activo + ')');
      } else {
        fail('tc08', 'TC-08: Movil NO fue reactivado (activo=' + activo + ')');
      }
    }
  }

  // --- Resumen final ---
  console.log('\n=== Resumen de ejecución ===');
  console.log('Entorno: ' + ENTORNO);
  const tcKeys = ['tc01','tc02','tc03','tc04','tc05','tc06','tc07','tc08'];
  console.log('Resultados: ' + tcKeys.map(k => k.toUpperCase() + '=' + (results[k]||'SKIP')).join(' | '));
  const fails = tcKeys.filter(k => results[k] === 'FAIL').length;
  const passes = tcKeys.filter(k => results[k] === 'PASS').length;
  const skips = tcKeys.filter(k => !results[k] || results[k] === 'SKIP').length;
  console.log('PASS=' + passes + ' FAIL=' + fails + ' SKIP=' + skips);

  if (results.tc01 === 'FAIL' || results.tc02 === 'FAIL') {
    console.log('\n[PENDIENTE DEVOPS]');
    if (results.tc01 === 'FAIL') console.log('  - Habilitar config: moviles.cancelacionTicketsAlInactivar.habilitado = true');
    if (results.tc02 === 'FAIL') console.log('  - Ejecutar migración: 20260409000001_add_motivo_cancelacion_inactivacion_vehiculo');
  }
}

main().catch(e => console.error('ERR:', e.message));
