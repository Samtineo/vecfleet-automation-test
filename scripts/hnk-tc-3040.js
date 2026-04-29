process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');

const HOST = 'vec-twins-hnk-mx.vecfleet.io';
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

function pass(msg) { console.log('[PASS] ' + msg); }
function fail(msg) { console.log('[FAIL] ' + msg); }
function info(msg) { console.log('       ' + msg); }

// IDs de referencia
const TICKET_1 = 933717; // ya tiene ticket-presupuesto con manoDeObra=40, estado PRESUPUESTADO
const TICKET_2 = 933718; // estado PRESUPUESTADO, manoDeObra=20
const MOVIL_ID = 1348;
const BASE_ID = 1138;        // CD - TOLUCA
const SUBREGION_ID = 1029;   // EDO DE MEXICO
const REGION_ID = 1004;      // CENTRO
const PERIODO_ID = 1;

async function main() {
  const login = await request('POST', '/public/auth/login', { usuario: 'stineo', clave: 'susy1234' });
  const token = login.body.usuario.token;
  console.log('=== VEC-3040 Test Cases — HNK MX Test ===\n');

  // -------------------------------------------------------
  // TC-01: Ticket con fechaRealEntrega=NULL y fecha_aprobacion
  //        dentro del período aparece en resumen (fix fallback)
  // -------------------------------------------------------
  console.log('--- TC-01: Ticket APROBADO (fecha_aprobacion en período, fechaRealEntrega=NULL) aparece en resumen ---');

  // Approbar ticket 933717 → seteará fecha_aprobacion = hoy (2026-04-29, dentro del período)
  const aprob1 = await request('POST', '/tickets/aprobar/' + TICKET_1, null, token);
  info('POST /tickets/aprobar/' + TICKET_1 + ' → status=' + aprob1.status);

  // Verificar estado y fecha_aprobacion del ticket
  const t1 = await request('GET', '/tickets/' + TICKET_1, null, token);
  const t1Estado = t1.body.estado;
  const t1FechaAprob = t1.body.fechaAprobacion;
  const t1FechaReal = t1.body.fechaRealEntrega || null;
  info('Estado: ' + t1Estado + ' | fechaAprobacion: ' + t1FechaAprob + ' | fechaRealEntrega: ' + t1FechaReal);

  // Consultar resumen de base
  const res1 = await request('GET', '/presupuestos/presupuesto-resumen/' + BASE_ID + '?periodoId=' + PERIODO_ID + '&presupuestableType=base', null, token);
  const consumido1 = res1.body.consumido;
  info('Resumen base → consumido: ' + consumido1);

  if (t1Estado === 'APROBADO' && t1FechaAprob && !t1FechaReal && parseFloat(consumido1) > 0) {
    pass('TC-01: Ticket APROBADO sin fechaRealEntrega aparece en resumen (consumido=' + consumido1 + ')');
  } else if (t1Estado === 'APROBADO' && t1FechaAprob && !t1FechaReal && parseFloat(consumido1) === 0) {
    fail('TC-01: Ticket APROBADO sin fechaRealEntrega NO aparece en resumen (consumido=0)');
  } else {
    fail('TC-01: Estado inesperado — estado=' + t1Estado + ' fechaAprobacion=' + t1FechaAprob);
  }

  // -------------------------------------------------------
  // TC-02: Ticket con fechaRealEntrega dentro del período
  //        aparece en resumen (caso base pre-fix)
  // -------------------------------------------------------
  console.log('\n--- TC-02: Ticket con fechaRealEntrega dentro del período aparece en resumen ---');

  // Aprobar ticket 933718 primero para habilitarlo
  const aprob2 = await request('POST', '/tickets/aprobar/' + TICKET_2, null, token);
  info('POST /tickets/aprobar/' + TICKET_2 + ' → status=' + aprob2.status);

  // Setear fechaRealEntrega dentro del período via PATCH
  const patch2 = await request('PATCH', '/tickets/' + TICKET_2, { fechaRealEntrega: '2026-04-15' }, token);
  info('PATCH fechaRealEntrega → status=' + patch2.status);

  const t2 = await request('GET', '/tickets/' + TICKET_2, null, token);
  const t2Estado = t2.body.estado;
  const t2FechaReal = t2.body.fechaRealEntrega;
  info('Estado: ' + t2Estado + ' | fechaRealEntrega: ' + t2FechaReal);

  // El resumen de base ahora debería incluir ambos tickets (40 + 20 = 60)
  const res2 = await request('GET', '/presupuestos/presupuesto-resumen/' + BASE_ID + '?periodoId=' + PERIODO_ID + '&presupuestableType=base', null, token);
  const consumido2 = res2.body.consumido;
  info('Resumen base → consumido: ' + consumido2 + ' (esperado ≥ 20)');

  if (t2FechaReal && parseFloat(consumido2) >= 20) {
    pass('TC-02: Ticket con fechaRealEntrega en período aparece en resumen (consumido=' + consumido2 + ')');
  } else if (!t2FechaReal) {
    fail('TC-02: fechaRealEntrega no se seteó correctamente');
  } else {
    fail('TC-02: Ticket con fechaRealEntrega NO aparece en resumen (consumido=' + consumido2 + ')');
  }

  // -------------------------------------------------------
  // TC-03: Resumen de subregión incluye consumo de tickets
  //        del mismo móvil (1348 — mismo que TC-04)
  // -------------------------------------------------------
  console.log('\n--- TC-03: Resumen subregión EDO DE MEXICO incluye consumo de tickets del móvil ' + MOVIL_ID + ' ---');

  const res3 = await request('GET', '/presupuestos/presupuesto-resumen/' + SUBREGION_ID + '?periodoId=' + PERIODO_ID + '&presupuestableType=subregion', null, token);
  const consumido3 = res3.body.consumido;
  info('Resumen subregión → distribuido: ' + res3.body.distribuido + ' | consumido: ' + consumido3);

  if (parseFloat(consumido3) > 0) {
    pass('TC-03: Resumen subregión refleja consumo (consumido=' + consumido3 + ')');
  } else {
    fail('TC-03: Resumen subregión no refleja consumo (consumido=0)');
  }

  // -------------------------------------------------------
  // TC-04: Resumen de base incluye consumo del mismo móvil
  // -------------------------------------------------------
  console.log('\n--- TC-04: Resumen base CD-TOLUCA incluye consumo de tickets del móvil ' + MOVIL_ID + ' ---');

  const res4 = await request('GET', '/presupuestos/presupuesto-resumen/' + BASE_ID + '?periodoId=' + PERIODO_ID + '&presupuestableType=base', null, token);
  const consumido4 = res4.body.consumido;
  info('Resumen base → distribuido: ' + res4.body.distribuido + ' | consumido: ' + consumido4);

  if (parseFloat(consumido4) > 0) {
    pass('TC-04: Resumen base refleja consumo (consumido=' + consumido4 + ')');
  } else {
    fail('TC-04: Resumen base no refleja consumo (consumido=0)');
  }

  // -------------------------------------------------------
  // TC-05: Guardar monto de subregión no sobreescribe región
  // -------------------------------------------------------
  console.log('\n--- TC-05: Guardar monto subregión EDO DE MEXICO no sobreescribe campo región ---');

  const subBefore = await request('GET', '/subregiones/' + SUBREGION_ID, null, token);
  const regionBefore = subBefore.body.region && subBefore.body.region.id;
  info('Región antes del PATCH: ' + regionBefore + ' (' + (subBefore.body.region && subBefore.body.region.nombre) + ')');

  // Simular guardado de monto de subregión (PATCH presupuesto subregión)
  await request('PATCH', '/presupuestos/38', { monto_general: 58 }, token);

  const subAfter = await request('GET', '/subregiones/' + SUBREGION_ID, null, token);
  const regionAfter = subAfter.body.region && subAfter.body.region.id;
  info('Región después del PATCH: ' + regionAfter + ' (' + (subAfter.body.region && subAfter.body.region.nombre) + ')');

  if (regionBefore === REGION_ID && regionAfter === REGION_ID) {
    pass('TC-05: Región no fue sobreescrita (sigue siendo CENTRO, ID=' + regionAfter + ')');
  } else {
    fail('TC-05: Región cambió de ' + regionBefore + ' a ' + regionAfter);
  }

  // --- Resumen final ---
  console.log('\n=== Resumen de ejecución ===');
  console.log('Período: Abril-Mayo 2026 (2026-04-01 / 2026-04-30)');
  console.log('Móvil: ' + MOVIL_ID + ' (dominio 4280) | Base: CD-TOLUCA | Subregión: EDO DE MEXICO | Región: CENTRO');
  console.log('Ticket TC-01: ' + TICKET_1 + ' (APROBADO, manoDeObra=40, fechaRealEntrega=NULL)');
  console.log('Ticket TC-02: ' + TICKET_2 + ' (APROBADO, manoDeObra=20, fechaRealEntrega=2026-04-15)');
}

main().catch(e => console.error('ERR:', e.message));
