process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');

const HOST = 'vec-twins-hnk-mx.vecfleet.io';
const BASE = '/ws/Public/index.php/api';

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization-Token'] = token;
    const payload = body ? JSON.stringify(body) : null;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    const req = https.request({
      hostname: HOST, path: BASE + path, method, headers, rejectUnauthorized: false
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

async function main() {
  const login = await request('POST', '/public/auth/login', { usuario: 'stineo', clave: 'susy1234' });
  const token = login.body.usuario.token;
  console.log('Token OK');

  // Find presupuesto for base CD - TOLUCA (1138)
  const r = await request('GET', '/presupuestos?perPage=300', null, token);
  const all = r.body.presupuestos || [];
  const found = all.find(function(p) {
    return p.presupuestable_id === 1138 && p.presupuestable_type.indexOf('Base') !== -1;
  });
  if (!found) { console.log('No presupuesto found for base 1138'); return; }
  console.log('Presupuesto CD - TOLUCA: ID', found.id);

  // PATCH with full subregion budget (500,000)
  const patch = await request('PATCH', '/presupuestos/' + found.id, {
    monto_general: 500000
  }, token);
  console.log('PATCH status:', patch.status);
  console.log('Response:', JSON.stringify(patch.body));
}

main().catch(e => console.error('ERR:', e.message));
