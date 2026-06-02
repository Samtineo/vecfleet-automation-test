# Infracciones — Endpoint de búsqueda por parámetros múltiples (VEC-3249)

## 1. ¿Qué hace esta feature?

Agrega un nuevo endpoint `GET /api/infracciones/buscar-dominio-o-documento` que permite consultar infracciones por dominio del vehículo (patente) o por número y tipo de documento del conductor. Diseñado para consumo externo por el cliente, no por el frontend.

El endpoint existente `GET /infracciones/dominio/{dominio}` no fue modificado.

---

## 2. Endpoint

Base: `https://vec-dev.vecfleet.io/ws/Public/index.php/api`  
Auth header: `Authorization-Token: <token>`  
Permiso requerido: `INFRACCIONES_VISUALIZAR`

```
GET /infracciones/buscar-dominio-o-documento
```

**Parámetros (query string):**

| Parámetro | Tipo | Condición |
|---|---|---|
| `dominio` | string | Condicional — patente del vehículo |
| `nroDocumento` | string | Condicional — número de documento del conductor |
| `tipoDocumento` | string | Obligatorio junto con `nroDocumento` (ej: `"DNI"`) |

**Reglas de combinación:**
- Debe enviarse al menos un modo válido
- Modo 1: solo `dominio`
- Modo 2: `nroDocumento` + `tipoDocumento` (ambos, siempre juntos)
- Si se envían dominio + documento en el mismo request, **dominio tiene prioridad**

---

## 3. Respuestas

| HTTP | Escenario | Body |
|---|---|---|
| 200 | Consulta exitosa con resultados | Array de objetos infracción |
| 200 | Consulta válida sin resultados | `[]` |
| 400 | Sin parámetros | `{ "detalle": ["infracciones.errors.buscar.parametro_requerido"] }` |
| 400 | `nroDocumento` sin `tipoDocumento` | `{ "detalle": ["infracciones.errors.buscar.tipo_documento_requerido"] }` |
| 404 | Dominio no registrado | `{ "detalle": ["La entidad 'Movil' con ID X no existe."] }` |
| 404 | Conductor no registrado | `{ "detalle": ["La entidad 'Persona' con nro de documento X (DNI) no existe."] }` |

**Estructura de cada infracción en la respuesta:** idéntica a `GET /infracciones/dominio/{dominio}`.

---

## 4. Casos de prueba

| CA | Escenario | Resultado esperado | Estado |
|---|---|---|---|
| CA01 | `?dominio=RHYG-54-K` (tiene infracciones) | HTTP 200, array con infracciones | ✅ PASS |
| CA02 | `?nroDocumento=0000000008&tipoDocumento=DNI` | HTTP 200, array con infracciones del conductor | ✅ PASS |
| CA03 | `?nroDocumento=12345678` (sin tipo) | HTTP 400 `tipo_documento_requerido` | ✅ PASS |
| CA04 | `?dominio=TGRC-30` (sin infracciones) | HTTP 200, `[]` | ✅ PASS |
| CA05 | Sin parámetros | HTTP 400 `parametro_requerido` | ✅ PASS |
| Extra | `?dominio=XXXXXXXXX` (no existe) | HTTP 404 con mensaje de entidad no encontrada | ✅ PASS |
| Extra | `?nroDocumento=99999999&tipoDocumento=DNI` (no existe) | HTTP 404 con mensaje de entidad no encontrada | ✅ PASS |
| Extra | `?dominio=RHYG-54-K&nroDocumento=99999999&tipoDocumento=DNI` | HTTP 200, infracciones del dominio (prioridad) | ✅ PASS |

---

## 5. Data de prueba — vec-dev

| Dato | Valor |
|---|---|
| Dominio con infracciones | `RHYG-54-K` (movil ID 2) — infracción ID 8266 |
| Dominio sin infracciones | `TGRC-30` (movil ID 6) |
| Conductor con infracciones | Persona 4 (USUARIO DEFAULT), DNI `0000000008` — infracciones IDs 393, 8275, 8295 |

---

## 6. Resultados QA

Todos los CAs: ✅ PASS (2026-06-02)  
**QA Report:** VEC-3260
