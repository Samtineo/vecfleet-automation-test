process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');
const fs = require('fs');
const path = require('path');

const DOCS_FILE = path.join(__dirname, '../docs/periodo_de_presupuestos.md');
const ENTORNO = 'Heineken-Test';
const PERIODO_LABEL = '71 (05-04/06-03)';

const HOST = 'test-heineken.vecfleet.io';
const BASE_PATH = '/ws/Public/index.php/api';

// Entidades Heineken-Test — periodo 71 (2026-05-04 / 2026-06-03)
const PERIODO_ID = 71;
const REGION_ID = 1004;      // CENTRO
const SUBREGION_ID = 1019;   // PUEBLA
const BASE_ID = 1101;        // CD - TEHUACAN
const PRESUPUESTO_REGION_ID = 17435;
const PRESUPUESTO_SUBREGION_ID = 17462;
const PRESUPUESTO_BASE_ID = 17579;
// Ticket 13074: CORRECTIVO, ABIERTO, movil 1115 (SN57854), base 1101 (CD-TEHUACAN), subregion 1019 (PUEBLA), sin fechaRealEntrega
// Flujo: ABIERTO → presupuestar (manoDeObra=1000, repuestos=500) → PRESUPUESTADO → aprobar → APROBADO
const TICKET_ID = 13074;
const PRESUPUESTO_MANO_DE_OBRA = 1000;
const PRESUPUESTO_REPUESTOS = 500;
const TICKET_TOTAL = PRESUPUESTO_MANO_DE_OBRA + PRESUPUESTO_REPUESTOS; // 1500

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

const results = { tc01: 'SKIP', tc02: 'SKIP', tc03: 'SKIP', tc04: 'SKIP' };
function pass(tc, msg) { results[tc] = 'PASS'; console.log('[PASS] ' + msg); }
function fail(tc, msg) { results[tc] = 'FAIL'; console.log('[FAIL] ' + msg); }
function info(msg)     { console.log('       ' + msg); }

async function main() {
  const login = await request('POST', '/public/auth/login', { usuario: 'stineo', clave: 'susy1234' });
  const token = login.body.token || (login.body.usuario && login.body.usuario.token);
  if (!token) { console.error('Login failed:', JSON.stringify(login.body)); return; }

  console.log('=== VEC-3040 Test Cases — Heineken-Test ===');
  console.log('Periodo: 71 (2026-05-04 / 2026-06-03)');
  console.log('Jerarquia: Region CENTRO (1004) -> Subregion PUEBLA (1019) -> Base CD-TEHUACAN (1101)');
  console.log('Ticket: ' + TICKET_ID + ' | flujo ABIERTO->PRESUPUESTADO->APROBADO | total=' + TICKET_TOTAL + '\n');

  // -------------------------------------------------------
  // SETUP: Presupuesto para resumen base ANTES
  // -------------------------------------------------------
  console.log('--- SETUP: Asignar presupuesto a jerarquia ---');
  const pRegion = await request('PATCH', '/presupuestos/' + PRESUPUESTO_REGION_ID, { monto_general: 5000000 }, token);
  info('PATCH region ' + PRESUPUESTO_REGION_ID + ' monto=5000000 -> status=' + pRegion.status);
  const pSub = await request('PATCH', '/presupuestos/' + PRESUPUESTO_SUBREGION_ID, { monto_general: 2000000 }, token);
  info('PATCH subregion ' + PRESUPUESTO_SUBREGION_ID + ' monto=2000000 -> status=' + pSub.status);
  const pBase = await request('PATCH', '/presupuestos/' + PRESUPUESTO_BASE_ID, { monto_general: 1000000 }, token);
  info('PATCH base ' + PRESUPUESTO_BASE_ID + ' monto=1000000 -> status=' + pBase.status);

  const resBefore = await request('GET', '/presupuestos/presupuesto-resumen/' + BASE_ID + '?periodoId=' + PERIODO_ID + '&presupuestableType=base', null, token);
  const comprometidoBefore = parseFloat(resBefore.body.comprometido || 0);
  info('Resumen base ANTES -> comprometido=' + comprometidoBefore + ' consumido=' + resBefore.body.consumido);

  // -------------------------------------------------------
  // TC-01: Flujo completo ABIERTO → presupuestar → PRESUPUESTADO → aprobar → APROBADO
  //        sin fechaRealEntrega el ticket debe aparecer en comprometido (fix COALESCE)
  // -------------------------------------------------------
  console.log('\n--- TC-01: Ticket PRESUPUESTADO→APROBADO sin fechaRealEntrega aparece en comprometido ---');

  const tInit = await request('GET', '/tickets/' + TICKET_ID, null, token);
  const totalTicket = (parseFloat(tInit.body.manoDeObra)||0) + (parseFloat(tInit.body.repuestos)||0) + (parseFloat(tInit.body.impuestos)||0) + (parseFloat(tInit.body.otros)||0);
  info('Ticket ' + TICKET_ID + ': estado=' + tInit.body.estado + ' | ticketTipo=' + tInit.body.ticketTipo + ' | total=' + totalTicket + ' | fechaRealEntrega=' + tInit.body.fechaRealEntrega);

  const estadoInicial = tInit.body.estado;

  if (estadoInicial !== 'ABIERTO' && estadoInicial !== 'PRESUPUESTADO') {
    fail('tc01', 'TC-01: Ticket no esta en estado ABIERTO ni PRESUPUESTADO (estado=' + estadoInicial + ')');
  } else {
    // Paso 1 (solo si está ABIERTO): presupuestar
    if (estadoInicial === 'ABIERTO') {
      const pres = await request('POST', '/ticket-presupuestos/ticket/' + TICKET_ID, {
        id: TICKET_ID, manoDeObra: PRESUPUESTO_MANO_DE_OBRA, repuestos: PRESUPUESTO_REPUESTOS, impuestos: 0, otros: 0, adicional: false
      }, token);
      info('POST /ticket-presupuestos/ticket/' + TICKET_ID + ' -> status=' + pres.status);
      if (pres.status !== 200 && pres.status !== 201) {
        fail('tc01', 'TC-01: Error al presupuestar -> status=' + pres.status + ' | ' + JSON.stringify(pres.body).substring(0, 200));
        return;
      }
    } else {
      info('Ticket ya en PRESUPUESTADO — omitiendo paso de presupuestar');
    }

    // Paso 2: Aprobar
    const aprob = await request('POST', '/tickets/aprobar/' + TICKET_ID, null, token);
    info('POST /tickets/aprobar/' + TICKET_ID + ' -> status=' + aprob.status);

    if (aprob.status !== 200 && aprob.status !== 204) {
      fail('tc01', 'TC-01: Error al aprobar -> status=' + aprob.status + ' | ' + JSON.stringify(aprob.body).substring(0, 250));
    } else {
      const tAfter = await request('GET', '/tickets/' + TICKET_ID, null, token);
      info('Ticket despues de aprobar: estado=' + tAfter.body.estado + ' | fechaAprobacion=' + tAfter.body.fechaAprobacion + ' | fechaRealEntrega=' + tAfter.body.fechaRealEntrega);

      const resAfter = await request('GET', '/presupuestos/presupuesto-resumen/' + BASE_ID + '?periodoId=' + PERIODO_ID + '&presupuestableType=base', null, token);
      const comprometidoAfter = parseFloat(resAfter.body.comprometido || 0);
      info('Resumen base DESPUES -> comprometido=' + comprometidoAfter + ' (era ' + comprometidoBefore + ', delta esperado: +' + totalTicket + ')');

      const estadoOk = tAfter.body.estado === 'APROBADO';
      const fechaAprobOk = !!tAfter.body.fechaAprobacion;
      const noFechaReal = !tAfter.body.fechaRealEntrega;
      const comprometidoAumento = comprometidoAfter > comprometidoBefore;

      if (estadoOk && fechaAprobOk && noFechaReal && comprometidoAumento) {
        pass('tc01', 'TC-01: Ticket APROBADO sin fechaRealEntrega aparece en comprometido (comprometido=' + comprometidoAfter + ', +' + (comprometidoAfter - comprometidoBefore).toFixed(3) + ')');
      } else if (estadoOk && fechaAprobOk && noFechaReal && !comprometidoAumento) {
        fail('tc01', 'TC-01: Ticket aprobado pero comprometido no aumento (bug COALESCE?) comprometido=' + comprometidoAfter);
      } else {
        fail('tc01', 'TC-01: Estado inesperado | estadoOk=' + estadoOk + ' fechaAprobOk=' + fechaAprobOk + ' noFechaReal=' + noFechaReal + ' comprometido=' + comprometidoAfter);
      }
    }
  }

  // -------------------------------------------------------
  // TC-02: Resumen subregion refleja comprometido
  // -------------------------------------------------------
  console.log('\n--- TC-02: Resumen subregion refleja comprometido del ticket aprobado ---');
  const resSub = await request('GET', '/presupuestos/presupuesto-resumen/' + SUBREGION_ID + '?periodoId=' + PERIODO_ID + '&presupuestableType=subregion', null, token);
  const comprometidoSub = parseFloat(resSub.body.comprometido || 0);
  info('Resumen subregion ' + SUBREGION_ID + ' -> distribuido=' + resSub.body.distribuido + ' comprometido=' + comprometidoSub);
  if (comprometidoSub > 0) {
    pass('tc02', 'TC-02: Resumen subregion refleja comprometido (comprometido=' + comprometidoSub + ')');
  } else {
    fail('tc02', 'TC-02: Resumen subregion comprometido=0');
  }

  // -------------------------------------------------------
  // TC-03: Resumen base refleja comprometido
  // -------------------------------------------------------
  console.log('\n--- TC-03: Resumen base refleja comprometido del ticket aprobado ---');
  const resBase = await request('GET', '/presupuestos/presupuesto-resumen/' + BASE_ID + '?periodoId=' + PERIODO_ID + '&presupuestableType=base', null, token);
  const comprometidoBase = parseFloat(resBase.body.comprometido || 0);
  info('Resumen base ' + BASE_ID + ' -> distribuido=' + resBase.body.distribuido + ' comprometido=' + comprometidoBase);
  if (comprometidoBase > 0) {
    pass('tc03', 'TC-03: Resumen base refleja comprometido (comprometido=' + comprometidoBase + ')');
  } else {
    fail('tc03', 'TC-03: Resumen base comprometido=0');
  }

  // -------------------------------------------------------
  // TC-04: Guardar monto subregion no sobreescribe campo region
  // -------------------------------------------------------
  console.log('\n--- TC-04: Guardar monto subregion no sobreescribe campo region ---');
  const subBefore = await request('GET', '/subregiones/' + SUBREGION_ID, null, token);
  const regionBefore = subBefore.body.region && subBefore.body.region.id;
  info('Region antes del PATCH: ' + regionBefore);

  await request('PATCH', '/presupuestos/' + PRESUPUESTO_SUBREGION_ID, { monto_general: 1500000 }, token);

  const subAfter = await request('GET', '/subregiones/' + SUBREGION_ID, null, token);
  const regionAfter = subAfter.body.region && subAfter.body.region.id;
  info('Region despues del PATCH: ' + regionAfter);

  if (regionBefore === REGION_ID && regionAfter === REGION_ID) {
    pass('tc04', 'TC-04: Region no fue sobreescrita (sigue siendo ID=' + regionAfter + ')');
  } else {
    fail('tc04', 'TC-04: Region cambio de ' + regionBefore + ' a ' + regionAfter);
  }

  // --- Resumen final ---
  console.log('\n=== Resumen de ejecucion ===');
  console.log('Entorno: test-heineken.vecfleet.io | Periodo: ' + PERIODO_ID + ' (2026-05-04 / 2026-06-03)');
  console.log('Jerarquia: CENTRO (1004) -> PUEBLA (1019) -> CD-TEHUACAN (1101)');
  console.log('Ticket: ' + TICKET_ID + ' | flujo ABIERTO->PRESUPUESTADO->APROBADO | manoDeObra=' + PRESUPUESTO_MANO_DE_OBRA + ' repuestos=' + PRESUPUESTO_REPUESTOS + ' total=' + TICKET_TOTAL);
  console.log('Resultados: TC-01=' + results.tc01 + ' | TC-02=' + results.tc02 + ' | TC-03=' + results.tc03 + ' | TC-04=' + results.tc04);

  appendRunToDoc(results);
}

function appendRunToDoc(results) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const row = `| ${today} | ${ENTORNO} | ${PERIODO_LABEL} | ${TICKET_ID} | ${results.tc01} | ${results.tc02} | ${results.tc03} | ${results.tc04} |`;
    let doc = fs.readFileSync(DOCS_FILE, 'utf8');
    doc = doc.replace(
      /(\| Fecha \| Entorno[\s\S]*?\n)([\s\S]*?)(\n---|\n\n##)/,
      (_, header, body, tail) => header + body + row + '\n' + tail
    );
    fs.writeFileSync(DOCS_FILE, doc, 'utf8');
    console.log('\n[DOC] Resultado registrado en docs/periodo_de_presupuestos.md');
  } catch (e) {
    console.log('\n[DOC] No se pudo actualizar la doc:', e.message);
  }
}

main().catch(e => console.error('ERR:', e.message));
