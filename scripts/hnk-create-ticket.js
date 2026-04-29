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

async function main() {
  const login = await request('POST', '/public/auth/login', { usuario: 'stineo', clave: 'susy1234' });
  const token = login.body.usuario.token;
  console.log('Token OK');

  const ticketBody = {
    ticketTipo: 'CORRECTIVO',
    estado: 'ABIERTO',
    detalle: 'Ticket de prueba QA - VEC-3040 setup presupuesto periodo',
    servicio: { id: 1 },
    movil: {
      id: 1348,
      dnrpaStatus: false,
      unidad: 'LC18076',
      dominio: '4280',
      tipologia_posicion_id: 2,
      tipologiaPosicion: {
        id: 2,
        identificador: 'dos_ejes',
        background: 'dos_ejes.png',
        posiciones: [
          { x: 37,  y: 53,  posicion: 1 },
          { x: 135, y: 53,  posicion: 2 },
          { x: 37,  y: 291, posicion: 3 },
          { x: 135, y: 291, posicion: 4 }
        ],
        repuestos: 2,
        llanta_posiciones: []
      },
      clase_id: null,
      claseEloquent: null,
      base: {
        id: 1138,
        descripcion: 'CD - TOLUCA',
        region: { id: 1004, nombre: 'CENTRO', activo: true },
        subregion: { id: 1029, nombre: 'EDO DE MEXICO' }
      }
    },
    gerenciador: { id: 10 },
    taller: 1090
  };

  const res = await request('POST', '/tickets', ticketBody, token);
  console.log('POST /tickets status:', res.status);
  console.log('Response:', JSON.stringify(res.body).slice(0, 600));
}

main().catch(e => console.error('ERR:', e.message));
