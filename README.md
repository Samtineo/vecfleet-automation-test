# vecfleet-automation-test

Suite de tests automatizados para la API de VecFleet usando **Newman** (CLI runner de Postman).

## Requisitos

- Node.js 18+
- npm

## Setup

```bash
# Instalar Newman y el reporter HTML
npm install

# Completar credenciales en el entorno que se quiere usar
# Editar environments/vec-dev.postman_environment.json
# Cargar username y password
```

## Ejecutar tests

```bash
# Contra vec-dev (default)
npm test

# Contra un entorno específico
npm run test:vec-dev
npm run test:vec-hotfix
npm run test:dinant
npm run test:teco

# Ejecutar una carpeta específica de la colección
npm run test:folder -- "Auth"
npm run test:folder -- "Tickets"

# Detener en el primer fallo
npm run test:bail
```

## Entornos disponibles

| Script | Entorno | URL |
|---|---|---|
| `test:vec-dev` | Vec Dev | `https://vec-dev.vecfleet.io/ws/Public/index.php/api` |
| `test:vec-hotfix` | VEC Hotfix | `https://vec-hotfix.vecfleet.io/ws/Public/index.php/api` |
| `test:dinant` | Vec Dinant-test | `https://test-dinant.vecfleet.io/ws/Public/index.php/api` |
| `test:teco` | Vec teco-test | `https://testing-teco.vec.com.ar/ws/Public/index.php/api` |

## Estructura

```
vecfleet-automation-test/
├── collections/
│   └── vecfleet-api.postman_collection.json   # Colección principal
├── environments/
│   ├── vec-dev.postman_environment.json
│   ├── vec-hotfix.postman_environment.json
│   ├── dinant-test.postman_environment.json
│   └── teco-test.postman_environment.json
├── reports/                                   # Generados al correr tests (ignorado por git)
├── package.json
└── README.md
```

## Reportes

Cada ejecución genera un reporte HTML en `reports/`. Abrir en el navegador para ver resultados detallados con tiempos, asserts y errores.

## Credenciales

Las credenciales (`username`, `password`) se cargan en los archivos de entorno localmente.
**Nunca commitear archivos de entorno con credenciales reales.**

## Agregar tests a los requests

Los test scripts se agregan directamente en Postman (pestaña **Tests** de cada request) y se guardan en la colección. Ejemplo:

```javascript
// Verificar status code
pm.test("Status 200", () => pm.response.to.have.status(200));

// Verificar estructura del body
pm.test("Retorna token", () => {
    const body = pm.response.json();
    pm.expect(body.usuario.token).to.not.be.empty;
});

// Guardar token para requests siguientes
const token = pm.response.json()?.usuario?.token;
if (token) pm.environment.set("token", token);
```
