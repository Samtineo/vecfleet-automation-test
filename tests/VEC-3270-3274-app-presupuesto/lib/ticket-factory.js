// ticket-factory.js — crea tickets correctivos para la suite, rotando el movil
// para no toparse con el limite max_tickets por movil en vec-dev.
//
// La lista de moviles activos de vec-dev vive en moviles.json (capturada del
// entorno). Se rota de forma round-robin y, ante un fallo de creacion (movil
// topado), se reintenta con el siguiente.

const fs = require('fs');
const path = require('path');
const { apiRequest, SERVICIO_ID } = require('./presupuesto-api');

const MOVILES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'moviles.json'), 'utf8'));

// Arrancamos en un offset aleatorio para que reejecuciones no choquen siempre
// contra el mismo prefijo de moviles topados (en vec-dev ~3/4 estan saturados).
let movIdx = Math.floor(Math.random() * MOVILES.length);
function nextMovil() {
  const m = MOVILES[movIdx % MOVILES.length];
  movIdx += 1;
  return m;
}

// Crea un ticket correctivo ABIERTO. Rota el movil ante el tope max_tickets y
// reintenta. Por defecto recorre TODA la lista antes de rendirse (en vec-dev la
// mayoria de los moviles estan topados, por eso el budget es la lista completa).
// Devuelve { id, movil }.
async function crearCorrectivo(token, detalle, intentos = MOVILES.length) {
  let last;
  for (let i = 0; i < intentos; i++) {
    const movil = nextMovil();
    const res = await apiRequest('POST', '/tickets', {
      ticketTipo: 'CORRECTIVO',
      movil:    { id: movil },
      servicio: { id: SERVICIO_ID },
      detalle,
    }, token);
    if (res.status === 201 && res.body && res.body.id) {
      return { id: res.body.id, movil };
    }
    last = res;
    // Si el rechazo NO es por tope de tickets, no tiene sentido seguir rotando.
    const esTope = res.status === 400 && JSON.stringify(res.body || '').includes('max_tickets');
    if (!esTope) {
      throw new Error(`crearCorrectivo: rechazo no recuperable ${res.status} ${JSON.stringify(res.body).slice(0, 150)}`);
    }
  }
  throw new Error(`crearCorrectivo agoto ${intentos} intentos (todos topados). Ultimo: ${last && last.status} ${JSON.stringify(last && last.body).slice(0, 120)}`);
}

module.exports = { crearCorrectivo, nextMovil };
