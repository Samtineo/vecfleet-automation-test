# Guía de ejecución — vecfleet-automation-test

Paso a paso para instalar, configurar y correr la suite de tests automatizados de la API VecFleet.

---

## Requisitos previos

- [ ] **Node.js 18+** instalado — verificar con `node --version`
- [ ] **npm** instalado — verificar con `npm --version`
- [ ] **Git** instalado — verificar con `git --version`
- [ ] Credenciales de acceso a alguno de los entornos de prueba (username + password)

---

## 1. Clonar el repositorio

```bash
git clone https://github.com/Samtineo/vecfleet-automation-test.git
cd vecfleet-automation-test
```

---

## 2. Instalar dependencias

```bash
npm install
```

Esto instala:
- **Newman** — CLI runner de Postman
- **newman-reporter-htmlextra** — generador de reportes HTML

---

## 3. Configurar credenciales del entorno

Abrir el archivo del entorno a usar dentro de `environments/` y completar `username` y `password`:

```json
// environments/vec-dev.postman_environment.json
{
    "values": [
        { "key": "url",      "value": "https://vec-dev.vecfleet.io/ws/Public/index.php/api" },
        { "key": "username", "value": "TU_USUARIO_AQUÍ" },
        { "key": "password", "value": "TU_CONTRASEÑA_AQUÍ" },
        { "key": "token",    "value": "" }
    ]
}
```

> **Importante:** nunca commitear credenciales reales. Los archivos de entorno están en `.gitignore` si contienen datos sensibles.

### Entornos disponibles

| Archivo | Entorno | URL |
|---|---|---|
| `vec-dev.postman_environment.json` | Vec Dev | `https://vec-dev.vecfleet.io` |
| `vec-hotfix.postman_environment.json` | VEC Hotfix | `https://vec-hotfix.vecfleet.io` |
| `dinant-test.postman_environment.json` | Dinant Test | `https://test-dinant.vecfleet.io` |
| `teco-test.postman_environment.json` | Teco Test | `https://testing-teco.vec.com.ar` |

---

## 4. Ejecutar los tests

### Correr toda la colección contra un entorno

```bash
# Vec Dev (default)
npm test

# O explícitamente por entorno
npm run test:vec-dev
npm run test:vec-hotfix
npm run test:dinant
npm run test:teco
```

### Correr una carpeta específica de la colección

```bash
# Solo autenticación
npm run test:folder -- "authentication"

# Solo tickets
npm run test:folder -- "Tickets"

# Solo combustibles
npm run test:folder -- "Combustibles"

# Solo ociosidad/disponibilidad
npm run test:folder -- "Ociosidad"
```

### Detener en el primer fallo (útil para debugging)

```bash
npm run test:bail
```

### Correr con más detalle en consola

```bash
npx newman run collections/vecfleet-api.postman_collection.json \
  -e environments/vec-dev.postman_environment.json \
  --verbose
```

---

## 5. Ver el reporte HTML

Después de cada ejecución se genera un reporte en la carpeta `reports/`:

```
reports/
├── vec-dev.html
├── vec-hotfix.html
├── dinant-test.html
└── teco-test.html
```

Abrir el archivo `.html` en cualquier navegador. El reporte incluye:
- Resumen de tests pasados / fallidos
- Tiempo de respuesta por request
- Detalle de cada aserción
- Body de requests y responses

---

## 6. Actualizar la colección desde Postman

Cuando se agreguen nuevos requests o test scripts desde la app de Postman:

1. En Postman: **Export** → **Collection v2.1** → guardar como `vecfleet-api.postman_collection.json`
2. Reemplazar el archivo en `collections/`
3. Volver a correr `node scripts/add-tests.js` para re-inyectar los test scripts automatizados
4. Hacer commit y push:

```bash
git add collections/vecfleet-api.postman_collection.json
git commit -m "Update Postman collection"
git push
```

---

## 7. Agregar nuevos test scripts

Los test scripts se pueden agregar de dos formas:

### A) Desde Postman (recomendado para exploración)

1. Abrir el request en Postman
2. Ir a la pestaña **Tests**
3. Escribir el script en JavaScript usando la API de `pm`
4. Exportar y reemplazar la colección

### B) Desde el script de inyección (recomendado para mantenimiento)

Editar `scripts/add-tests.js`, agregar una nueva entrada en `TEST_SCRIPTS`:

```javascript
'NombreCarpeta > nombre del request': [
    "pm.test('Status 200', () => pm.response.to.have.status(200));",
    "pm.test('Tiempo de respuesta < 3000ms', () => pm.expect(pm.response.responseTime).to.be.below(3000));"
]
```

Luego ejecutar:

```bash
node scripts/add-tests.js
```

### Ejemplos de test scripts frecuentes

```javascript
// Verificar status code
pm.test("Status 200", () => pm.response.to.have.status(200));

// Verificar tiempo de respuesta
pm.test("Tiempo < 3000ms", () => pm.expect(pm.response.responseTime).to.be.below(3000));

// Verificar que una clave existe en el body
pm.test("Retorna token", () => {
    pm.expect(pm.response.json()).to.have.property('usuario');
});

// Guardar variable para el siguiente request
pm.environment.set("token", pm.response.json().usuario.token);

// Verificar que el body es un array no vacío
pm.test("Lista no vacía", () => {
    pm.expect(pm.response.json()).to.be.an('array').that.is.not.empty;
});

// Verificar estructura de paginación
pm.test("Tiene paginación", () => {
    const body = pm.response.json();
    pm.expect(body.pagination).to.have.keys(['page', 'count', 'perPage']);
});
```

---

## 8. Integración con CI/CD (próximamente)

Para ejecutar los tests automáticamente en cada deploy, agregar al pipeline de GitHub Actions:

```yaml
- name: Run API tests
  run: |
    npm install
    npm run test:vec-dev
  env:
    # Inyectar credenciales desde GitHub Secrets
```

Ver roadmap completo en el [reporte del proyecto](../docs/reporte-proyecto.md).
