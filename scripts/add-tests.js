/**
 * Script para inyectar test scripts en los requests clave de la colección Postman.
 * Uso: node scripts/add-tests.js
 */

const fs = require('fs');
const path = require('path');

const COLLECTION_PATH = path.join(__dirname, '../collections/vecfleet-api.postman_collection.json');
const collection = JSON.parse(fs.readFileSync(COLLECTION_PATH, 'utf8'));

// ---------------------------------------------------------------------------
// Test scripts por request (folder > nombre del request)
// ---------------------------------------------------------------------------

const TEST_SCRIPTS = {

    'authentication > /public/auth/login': [
        "pm.test('Status 200 - Login exitoso', () => pm.response.to.have.status(200));",
        "pm.test('Tiempo de respuesta < 3000ms', () => pm.expect(pm.response.responseTime).to.be.below(3000));",
        "pm.test('Retorna objeto usuario', () => {",
        "    const body = pm.response.json();",
        "    pm.expect(body).to.have.property('usuario');",
        "});",
        "pm.test('Token no está vacío', () => {",
        "    const body = pm.response.json();",
        "    pm.expect(body.usuario.token).to.not.be.empty;",
        "});",
        "// Guardar token para requests siguientes",
        "const token = pm.response.json()?.usuario?.token;",
        "if (token) pm.environment.set('token', token);"
    ],

    'Autenticación > /auth/check': [
        "pm.test('Status 200 - Token válido', () => pm.response.to.have.status(200));",
        "pm.test('Tiempo de respuesta < 2000ms', () => pm.expect(pm.response.responseTime).to.be.below(2000));"
    ],

    'Bases > /bases/select': [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Retorna array de bases', () => {",
        "    const body = pm.response.json();",
        "    pm.expect(body).to.be.an('array');",
        "    pm.expect(body.length).to.be.greaterThan(0);",
        "});",
        "pm.test('Tiempo de respuesta < 3000ms', () => pm.expect(pm.response.responseTime).to.be.below(3000));"
    ],

    'Ociosidad > disponibilidad/newGrid': [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Retorna estructura de grilla de disponibilidad', () => {",
        "    const body = pm.response.json();",
        "    pm.expect(body).to.be.an('object');",
        "});",
        "pm.test('Tiempo de respuesta < 5000ms', () => pm.expect(pm.response.responseTime).to.be.below(5000));"
    ],

    'Tickets > /newGrid': [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Retorna tickets y paginación', () => {",
        "    const body = pm.response.json();",
        "    pm.expect(body).to.have.property('tickets');",
        "    pm.expect(body).to.have.property('pagination');",
        "    pm.expect(body.pagination).to.have.property('page');",
        "    pm.expect(body.pagination).to.have.property('count');",
        "    pm.expect(body.pagination).to.have.property('perPage');",
        "});",
        "pm.test('Tickets es un array', () => {",
        "    pm.expect(pm.response.json().tickets).to.be.an('array');",
        "});",
        "pm.test('Tiempo de respuesta < 5000ms', () => pm.expect(pm.response.responseTime).to.be.below(5000));"
    ],

    'Tickets > /grid': [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Tiempo de respuesta < 5000ms', () => pm.expect(pm.response.responseTime).to.be.below(5000));"
    ],

    'Tickets > /{ticket_id}': [
        "pm.test('Status 200 o 204', () => {",
        "    pm.expect(pm.response.code).to.be.oneOf([200, 204]);",
        "});",
        "pm.test('Tiempo de respuesta < 3000ms', () => pm.expect(pm.response.responseTime).to.be.below(3000));"
    ],

    'Combustibles > combustibles/grid': [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Retorna estructura de grilla', () => {",
        "    const body = pm.response.json();",
        "    pm.expect(body).to.be.an('object');",
        "});",
        "pm.test('Tiempo de respuesta < 5000ms', () => pm.expect(pm.response.responseTime).to.be.below(5000));"
    ],

    'Combustibles > /controles-carga': [
        "// 500 conocido en vec-dev — endpoint sin datos de config en este entorno",
        "pm.test('Status no es 401 ni 403', () => {",
        "    pm.expect(pm.response.code).to.not.be.oneOf([401, 403]);",
        "});",
        "pm.test('Tiempo de respuesta < 5000ms', () => pm.expect(pm.response.responseTime).to.be.below(5000));"
    ],

    'Formularios > Historico > formulario/newGrid': [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Tiempo de respuesta < 5000ms', () => pm.expect(pm.response.responseTime).to.be.below(5000));"
    ],

    'Commons > ConfigBussiness': [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Retorna configuración de negocio', () => {",
        "    const body = pm.response.json();",
        "    pm.expect(body).to.be.an('object');",
        "});",
        "pm.test('Tiempo de respuesta < 2000ms', () => pm.expect(pm.response.responseTime).to.be.below(2000));"
    ]
};

// ---------------------------------------------------------------------------
// Traversal y patch
// ---------------------------------------------------------------------------

let patchedCount = 0;

function buildTestEvent(lines) {
    return {
        listen: 'test',
        script: {
            exec: lines,
            type: 'text/javascript',
            packages: {}
        }
    };
}

function patchItems(items, parentFolder = '') {
    for (const item of items) {
        if (item.item) {
            // Es una carpeta — recursión
            patchItems(item.item, parentFolder ? `${parentFolder} > ${item.name}` : item.name);
        } else {
            // Es un request
            const key = parentFolder ? `${parentFolder} > ${item.name}` : item.name;
            if (TEST_SCRIPTS[key]) {
                // Reemplazar o agregar el evento "test"
                if (!item.event) item.event = [];
                const existingIdx = item.event.findIndex(e => e.listen === 'test');
                const testEvent = buildTestEvent(TEST_SCRIPTS[key]);
                if (existingIdx >= 0) {
                    item.event[existingIdx] = testEvent;
                } else {
                    item.event.push(testEvent);
                }
                patchedCount++;
                console.log(`  ✓ Patched: ${key}`);
            }
        }
    }
}

console.log('Inyectando test scripts en la colección...\n');
patchItems(collection.item);
fs.writeFileSync(COLLECTION_PATH, JSON.stringify(collection, null, 2), 'utf8');
console.log(`\nListo. ${patchedCount} requests actualizados.`);
