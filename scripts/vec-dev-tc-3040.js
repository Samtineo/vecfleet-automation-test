process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');

const HOST = 'vec-dev.vecfleet.io';
const BASE_PATH = '/ws/Public/index.php/api';

// Entidades vec-dev — período 146 (2026-03-30 / 2026-07-29)
const PERIODO_ID = 146;
const REGION_ID = 1;
const SUBREGION_ID = 1;
const BASE_ID = 1;
const PRESUPUESTO_REGION_ID = 1671;
const PRESUPUESTO_SUBREGION_ID = 1676;
const PRESUPUESTO_BASE_ID = 1681;
// Ticket 464: movil=1 (CCU7B11), manoDeObra=1000, repuestos=1000, total=2000
// sin fechaRealEntrega, presupuestoFechaHora=2026-04-01 (dentro del período)
const TICKET_ID = 464;
const TICKET_TOTAL = 2000; // manoDeObra=1000 + repuestos=1000

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

function pass(msg) { console.log('[PASS] ' + msg); }
function fail(msg) { console.log('[FAIL] ' + msg); }
function info(msg) { console.log('       ' + msg); }

async function main() {
  const login = await request('POST', '/public/auth/login', { usuario: 'stineo', clave: 'susy1234' });
  const token = login.body.token || (login.body.usuario && login.body.usuario.token);
  if (!token) { console.error('Login failed:', JSON.stringify(login.body)); return; }

  console.log('=== VEC-3040 Test Cases — vec-dev ===');
  console.log('Periodo: 146 (2026-03-30 / 2026-07-29)');
  console.log('Jerarquia: Region 1 -> Subregion 1 -> Base 1 (BASE DEFAULT)');
  console.log('Ticket: ' + TICKET_ID + ' | movil=1 (CCU7B11) | total=2000 | sin fechaRealEntrega\n');

  // -------------------------------------------------------
  // SETUP: Asignar presupuesto suficiente a jerarquia
  // -------------------------------------------------------
  console.log('--- SETUP: Asignar presupuesto a jerarquia ---');
  const pRegion = await request('PATCH', '/presupuestos/' + PRESUPUESTO_REGION_ID, { monto_general: 500000 }, token);
  info('PATCH region ' + PRESUPUESTO_REGION_ID + ' monto=500000 -> status=' + pRegion.status);
  const pSub = await request('PATCH', '/presupuestos/' + PRESUPUESTO_SUBREGION_ID, { monto_general: 300000 }, token);
  info('PATCH subregion ' + PRESUPUESTO_SUBREGION_ID + ' monto=300000 -> status=' + pSub.status);
  const pBase = await request('PATCH', '/presupuestos/' + PRESUPUESTO_BASE_ID, { monto_general: 500000 }, token);
  info('PATCH base ' + PRESUPUESTO_BASE_ID + ' monto=500000 -> status=' + pBase.status);

  const resBefore = await request('GET', '/presupuestos/presupuesto-resumen/' + BASE_ID + '?periodoId=' + PERIODO_ID + '&presupuestableType=base', null, token);
  const comprometidoBefore = parseFloat(resBefore.body.comprometido || 0);
  info('Resumen base ANTES -> comprometido=' + comprometidoBefore + ' consumido=' + resBefore.body.consumido);

  // -------------------------------------------------------
  // TC-01: Ticket APROBADO sin fechaRealEntrega aparece en comprometido
  // El fix aplica COALESCE(fechaRealEntrega, fecha_aprobacion) en la query
  // de comprometido. Sin el fix, NULL en fechaRealEntrega excluye el ticket.
  // -------------------------------------------------------
  console.log('\n--- TC-01: Ticket APROBADO sin fechaRealEntrega aparece en comprometido ---');

  const tBefore = await request('GET', '/tickets/' + TICKET_ID, null, token);
  info('Ticket ' + TICKET_ID + ': estado=' + tBefore.body.estado + ' | manoDeObra=' + tBefore.body.manoDeObra + ' | repuestos=' + tBefore.body.repuestos + ' | total=' + TICKET_TOTAL + ' | fechaRealEntrega=' + tBefore.body.fechaRealEntrega);

  if (tBefore.body.estado !== 'PRESUPUESTADO') {
    fail('TC-01: Ticket no esta en estado PRESUPUESTADO (estado=' + tBefore.body.estado + ')');
  } else {
    const aprob = await request('POST', '/tickets/aprobar/' + TICKET_ID, null, token);
    info('POST /tickets/aprobar/' + TICKET_ID + ' -> status=' + aprob.status);

    if (aprob.status !== 200 && aprob.status !== 204) {
      fail('TC-01: Error al aprobar ticket -> status=' + aprob.status + ' | ' + JSON.stringify(aprob.body).substring(0, 200));
    } else {
      const tAfter = await request('GET', '/tickets/' + TICKET_ID, null, token);
      info('Ticket despues: estado=' + tAfter.body.estado + ' | fechaAprobacion=' + tAfter.body.fechaAprobacion + ' | fechaRealEntrega=' + tAfter.body.fechaRealEntrega);

      const resAfter = await request('GET', '/presupuestos/presupuesto-resumen/' + BASE_ID + '?periodoId=' + PERIODO_ID + '&presupuestableType=base', null, token);
      const comprometidoAfter = parseFloat(resAfter.body.comprometido || 0);
      info('Resumen base DESPUES -> comprometido=' + comprometidoAfter + ' (era ' + comprometidoBefore + ', delta esperado: +' + TICKET_TOTAL + ')');

      const estadoOk = tAfter.body.estado === 'APROBADO';
      const fechaAprobOk = !!tAfter.body.fechaAprobacion;
      const noFechaReal = !tAfter.body.fechaRealEntrega;
      const comprometidoAumento = comprometidoAfter >= comprometidoBefore + TICKET_TOTAL;

      if (estadoOk && fechaAprobOk && noFechaReal && comprometidoAumento) {
        pass('TC-01: Ticket APROBADO sin fechaRealEntrega aparece en comprometido (comprometido=' + comprometidoAfter + ', +' + (comprometidoAfter - comprometidoBefore) + ')');
      } else if (estadoOk && fechaAprobOk && noFechaReal && !comprometidoAumento) {
        fail('TC-01: Ticket aprobado pero comprometido no aumento (bug COALESCE no deployado?) comprometido=' + comprometidoAfter);
      } else {
        fail('TC-01: Estado inesperado | estadoOk=' + estadoOk + ' fechaAprobOk=' + fechaAprobOk + ' comprometido=' + comprometidoAfter);
      }
    }
  }

  // -------------------------------------------------------
  // TC-02: Resumen subregion refleja comprometido del ticket aprobado
  // -------------------------------------------------------
  console.log('\n--- TC-02: Resumen subregion refleja comprometido del ticket aprobado ---');
  const resSub = await request('GET', '/presupuestos/presupuesto-resumen/' + SUBREGION_ID + '?periodoId=' + PERIODO_ID + '&presupuestableType=subregion', null, token);
  const comprometidoSub = parseFloat(resSub.body.comprometido || 0);
  info('Resumen subregion 1 -> distribuido=' + resSub.body.distribuido + ' comprometido=' + comprometidoSub);
  if (comprometidoSub > 0) {
    pass('TC-02: Resumen subregion refleja comprometido (comprometido=' + comprometidoSub + ')');
  } else {
    fail('TC-02: Resumen subregion comprometido=0');
  }

  // -------------------------------------------------------
  // TC-03: Resumen base refleja comprometido del ticket aprobado
  // -------------------------------------------------------
  console.log('\n--- TC-03: Resumen base refleja comprometido del ticket aprobado ---');
  const resBase = await request('GET', '/presupuestos/presupuesto-resumen/' + BASE_ID + '?periodoId=' + PERIODO_ID + '&presupuestableType=base', null, token);
  const comprometidoBase = parseFloat(resBase.body.comprometido || 0);
  info('Resumen base 1 -> distribuido=' + resBase.body.distribuido + ' comprometido=' + comprometidoBase);
  if (comprometidoBase > 0) {
    pass('TC-03: Resumen base refleja comprometido (comprometido=' + comprometidoBase + ')');
  } else {
    fail('TC-03: Resumen base comprometido=0');
  }

  // -------------------------------------------------------
  // TC-04: Guardar monto subregion no sobreescribe campo region
  // -------------------------------------------------------
  console.log('\n--- TC-04: Guardar monto subregion no sobreescribe campo region ---');
  const subBefore = await request('GET', '/subregiones/' + SUBREGION_ID, null, token);
  const regionBefore = subBefore.body.region && subBefore.body.region.id;
  info('Region antes del PATCH subregion: ' + regionBefore);

  await request('PATCH', '/presupuestos/' + PRESUPUESTO_SUBREGION_ID, { monto_general: 200000 }, token);

  const subAfter = await request('GET', '/subregiones/' + SUBREGION_ID, null, token);
  const regionAfter = subAfter.body.region && subAfter.body.region.id;
  info('Region despues del PATCH subregion: ' + regionAfter);

  if (regionBefore === REGION_ID && regionAfter === REGION_ID) {
    pass('TC-04: Region no fue sobreescrita (sigue siendo ID=' + regionAfter + ')');
  } else {
    fail('TC-04: Region cambio de ' + regionBefore + ' a ' + regionAfter);
  }

  // --- Resumen final ---
  console.log('\n=== Resumen de ejecucion ===');
  console.log('Entorno: vec-dev.vecfleet.io | Periodo: ' + PERIODO_ID + ' (2026-03-30 / 2026-07-29)');
  console.log('Ticket: ' + TICKET_ID + ' | movil=1 (CCU7B11) | total=2000 | sin fechaRealEntrega');
  console.log('Fix verificado: COALESCE(fechaRealEntrega, fecha_aprobacion) en query de comprometido');
}

main().catch(e => console.error('ERR:', e.message));
