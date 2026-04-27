/**
 * Genera collections/vecfleet-smoke.postman_collection.json
 * extrayendo solo los requests clave de la colección original,
 * en el orden correcto y sin interferencias entre entornos.
 *
 * Uso: node scripts/build-smoke-collection.js
 */

const fs = require('fs');
const path = require('path');

const SRC  = path.join(__dirname, '../collections/vecfleet-api.postman_collection.json');
const DEST = path.join(__dirname, '../collections/vecfleet-smoke.postman_collection.json');

const source = JSON.parse(fs.readFileSync(SRC, 'utf8'));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findFolder(items, name) {
    return items.find(i => i.item && i.name === name);
}

function findRequest(items, name) {
    return items.find(i => !i.item && i.name === name);
}

function cloneRequest(req, overrideTests) {
    const clone = JSON.parse(JSON.stringify(req));
    if (overrideTests) {
        if (!clone.event) clone.event = [];
        const idx = clone.event.findIndex(e => e.listen === 'test');
        const ev = { listen: 'test', script: { exec: overrideTests, type: 'text/javascript', packages: {} } };
        if (idx >= 0) clone.event[idx] = ev; else clone.event.push(ev);
    }
    return clone;
}

// ---------------------------------------------------------------------------
// Selección de requests para el smoke test
// ---------------------------------------------------------------------------

const src = source.item;

// 1. Auth — solo el login de vec-dev (sin loginElis)
const authFolder       = findFolder(src, 'authentication');
const autenticacionFolder = findFolder(src, 'Autenticación');
const loginReq         = findRequest(authFolder.item, '/public/auth/login');
const authCheckReq     = findRequest(autenticacionFolder.item, '/auth/check');

// 2. Bases
const basesFolder      = findFolder(src, 'Bases');
const basesSelectReq   = findRequest(basesFolder.item, '/bases/select');

// 3. Ociosidad
const ociosidadFolder  = findFolder(src, 'Ociosidad');
const dispGrid         = findRequest(ociosidadFolder.item, 'disponibilidad/newGrid');

// 4. Tickets
const ticketsFolder    = findFolder(src, 'Tickets');
const ticketsNewGrid   = findRequest(ticketsFolder.item, '/newGrid');
const ticketsGrid      = findRequest(ticketsFolder.item, '/grid');

// 5. Combustibles
const combFolder       = findFolder(src, 'Combustibles');
const combGrid         = findRequest(combFolder.item, 'combustibles/grid');
const controlesCarga   = findRequest(combFolder.item, '/controles-carga');

// 6. Formularios
const formFolder       = findFolder(src, 'Formularios');
const histFolder       = findFolder(formFolder.item, 'Historico');
const formGrid         = findRequest(histFolder.item, 'formulario/newGrid');

// 7. Config
const configBussiness  = findRequest(src, 'POST /get-config-busines') ||
                         findRequest(findFolder(src, 'Commons')?.item || [], 'ConfigBussiness');

// 8. Móviles (Fase 2)
const movilesFolder    = findFolder(src, 'Moviles');
const movilesNewGrid   = findRequest(movilesFolder.item, '/newGrid');

// 9. Preventivos (Fase 2)
const preventivosFolder = findFolder(src, 'Preventivos');
const preventivosGrid   = findRequest(preventivosFolder.item, '/grid');

// 10. Personas (Fase 2)
const personasFolder   = findFolder(src, 'Personas');
const personasGrid     = findRequest(personasFolder.item, '/personas/grid');

// 11. Gerenciadores (Fase 2)
const gerenciadoresFolder = findFolder(src, 'Gerenciadores');
const gerenciadoresSelect = findRequest(gerenciadoresFolder.item, '/gerenciadores/select');

// 12. Talleres (Fase 2)
const talleresFolder   = findFolder(src, 'Talleres');
const talleresGrid     = findRequest(talleresFolder.item, '/talleres/grid');

// ---------------------------------------------------------------------------
// Construcción de la colección smoke
// ---------------------------------------------------------------------------

const smoke = {
    info: {
        _postman_id: 'smoke-vecfleet-api',
        name: 'VecFleet API — Smoke Test',
        description: 'Suite de smoke test generada automáticamente. Cubre los flujos críticos de la API VecFleet.',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: [
        {
            name: '01 - Autenticación',
            item: [
                cloneRequest(loginReq),   // guarda token en env
                cloneRequest(authCheckReq)
            ]
        },
        {
            name: '02 - Bases',
            item: [basesSelectReq].filter(Boolean).map(r => cloneRequest(r))
        },
        {
            name: '03 - Ociosidad',
            item: [dispGrid].filter(Boolean).map(r => cloneRequest(r))
        },
        {
            name: '04 - Tickets',
            item: [ticketsNewGrid, ticketsGrid].filter(Boolean).map(r => cloneRequest(r))
        },
        {
            name: '05 - Combustibles',
            item: [combGrid, controlesCarga].filter(Boolean).map(r => cloneRequest(r))
        },
        {
            name: '06 - Formularios',
            item: [formGrid].filter(Boolean).map(r => cloneRequest(r))
        },
        ...(configBussiness ? [{
            name: '07 - Configuración',
            item: [cloneRequest(configBussiness)]
        }] : []),
        {
            name: '08 - Móviles',
            item: [movilesNewGrid].filter(Boolean).map(r => cloneRequest(r))
        },
        {
            name: '09 - Preventivos',
            item: [preventivosGrid].filter(Boolean).map(r => cloneRequest(r))
        },
        {
            name: '10 - Personas',
            item: [personasGrid].filter(Boolean).map(r => cloneRequest(r))
        },
        {
            name: '11 - Gerenciadores',
            item: [gerenciadoresSelect].filter(Boolean).map(r => cloneRequest(r))
        },
        {
            name: '12 - Talleres',
            item: [talleresGrid].filter(Boolean).map(r => cloneRequest(r))
        }
    ]
};

fs.writeFileSync(DEST, JSON.stringify(smoke, null, 2), 'utf8');

// Contar requests
let total = 0;
smoke.item.forEach(f => { total += f.item.length; });
console.log(`Colección smoke generada: ${DEST}`);
console.log(`${smoke.item.length} carpetas | ${total} requests`);
