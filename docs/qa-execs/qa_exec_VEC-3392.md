---
name: qa-exec-VEC-3392
description: "QA Exec para VEC-3392 Personas | Importador crea múltiples usuarios para la misma persona (bug/hotfix). Entorno vec-hotfix. Estado: FINALIZADA — PASS (OBS-01 resuelto por PR #2143)."
metadata:
  type: project
---

> **Estado: FINALIZADA — PASS.** Re-QA 2026-07-02 en vec-hotfix. El único bloqueante (OBS-01, reasignación/creación con username de otra persona) fue **resuelto por Julian en PR #2143**. Todas las reglas 2/4/5 + OBS-01 verificadas OK. QA Report VEC-3441.

## Entorno
- **URL base:** `https://vec-hotfix.vecfleet.io/ws/Public/index.php/api`
- **Usuario:** `stineo`
- **Auth:** header `Authorization-Token: <token>`. Login por `POST /public/auth/login` con `usuario`/`clave`. Token en `resp.token` (NO `resp.usuario.token` en vec-hotfix).
- **Entorno de trabajo:** vec-hotfix (la card está desplegada ahí; hotfix confirmado en la card).
- **Perfil usado para dar de alta usuarios en el Excel:** `MONOUSUARIO`.
- **Base disponible:** `BASE DEFAULT` (id 1).

## Prerrequisitos

| Item | Valor |
|---|---|
| Entorno | vec-hotfix |
| Permiso importar | `PERSONAS_IMPORTAR` + `PERSONAS_CREAR` |
| Perfil de stineo | `ADMINISTRADOR VF` (id 100) |
| Endpoint | `POST /api/personas/importar-excel` (multipart, hoja Excel `personas`) |

**Permiso PERSONAS_IMPORTAR (gotcha clave):** el perfil `ADMINISTRADOR VF` (id 100) de `stineo` en vec-hotfix **NO** tiene `PERSONAS_IMPORTAR` por default. El perfil `GESTOR FROTA` (id 1012) sí lo tiene. Para poder correr el import hay que otorgarlo. Dos formas usadas:
- **Sesión original (por API):** se agregó `PERSONAS_IMPORTAR` al perfil 100 vía `PUT /perfiles/100` y **se restauró al finalizar** (373 permisos originales).
- **Re-QA 2026-07-02 (por SQL):** se otorgó directo en la base de vec-hotfix:
  ```sql
  INSERT INTO `vec-hotfix`.perfil_permisos (perfil_id, permiso_id)
  SELECT 100, id FROM `vec-hotfix`.permisos WHERE codigo = 'PERSONAS_IMPORTAR';
  ```
Si se replica: registrar el set de permisos original antes de tocar el perfil y restaurarlo al terminar. El endpoint también exige `PERSONAS_CREAR`.

**Receta del import (para regresión):**
- Endpoint: `POST /api/personas/importar-excel`, **multipart/form-data**, campo del archivo llamado exactamente **`file`**.
- Permisos requeridos: `PERSONAS_IMPORTAR` + `PERSONAS_CREAR`.
- Respuesta (HTTP 200 incluso con errores de negocio):
  ```json
  { "stats": { "personas_creadas": 0, "usuarios_creados": 0, "usuarios_reasignados": 0, "usuarios_existentes": 0, ... },
    "errores": [], "advertencias": [], "access_links": [] }
  ```
- Generador del xlsx: node + la librería `xlsx` de `vecfleet-automation-test/node_modules/xlsx`.

**Formato del Excel del importador:**
- Hoja obligatoria: `personas`.
- Headers usados en el re-QA: `Nombre`, `Apellido`, `Documento tipo`, `Documento numero`, `Base`, `Es activo`, `Es usuario`, `Email`, `Usuario`, `Perfil`, `Notificaciones activas`.
- Columnas requeridas siempre: `Nombre`, `Apellido`, `Documento tipo`, `Documento numero`, `Base`, `Es activo`, `Es usuario`.
- Columnas condicionales cuando `Es usuario = SI`: `Usuario`, `Perfil`, `Notificaciones activas`, `Email`.
- `Documento tipo` debe matchear un valor válido en la tabla `documento_tipos` (ej. `DNI`). Si no matchea, la clave de identidad queda vacía (ver Gotcha 3).

## Endpoints usados

| Método | Endpoint | Para qué |
|---|---|---|
| POST | `/public/auth/login` | Obtener token (`resp.token`) |
| POST | `/api/personas/importar-excel` | Importar el Excel de personas/usuarios (multipart) |
| GET | `/api/personas/{id}` | Verificar estado de una persona (esUsuario, usuario vinculado) |
| GET | `/api/perfiles/{id}` | Leer permisos del perfil (setup/restore) |
| PUT | `/api/perfiles/{id}` | Agregar/restaurar PERSONAS_IMPORTAR en perfil 100 |

**Nota:** `GET /api/personas` (listado plano) devuelve `403 DISABLED_SERVICE`. Para verificaciones usar `GET /api/personas/{id}`, `/api/personas/select` o `/api/personas/grid`.

## Contexto del bug y del fix (code-verified)

**Causa raíz:** `PersonasImportService::importarUsuarios` evaluaba la existencia del usuario por username (`cacheUsuarios[username] = persona`), no por persona. Si el username del Excel no existía, creaba un usuario nuevo sin validar si la persona ya tenía uno. En MELI Linehaul generó +800 usuarios duplicados para las mismas personas (corregidos manualmente).

**Fix (PR #2135, commits `9d310709f` + `db6175d01`), verificado en `vec-fleet-api/Service/PersonasImportService.php`:**
- Nueva propiedad `cachePersonaUsuario` (persona_id → username), poblada en `cargarCacheUsuarios` (~líneas 636-640).
- Gate por persona en `importarUsuarios` (bloque ~974-996): si `isset(cachePersonaUsuario[personaId])` y el username del Excel difiere → agrega error "La persona ya tiene el usuario 'X' asignado. El usuario 'Y' no fue creado" y hace `continue` (NO crea). Si el username es igual → `usuarios_existentes++`.
- Nueva `buildDocKey(tipo, numero)` (~líneas 1367-1395): identidad de persona por `tipoId:numero` (antes solo número). Reemplaza `normalizarDocumento` en `validarDuplicadosExcel`, `agregarLookupKeys` y `cargarCachePersonas`.

**Reglas de negocio (comentario dev Julian Quino en la card):**
- Identidad de persona = **tipo de documento + número de documento**.
- Regla 2: persona no existe → crea persona + usuario.
- Regla 3: persona existe sin usuario → crea usuario y lo vincula.
- Regla 4: persona con usuario del mismo nombre → existente, sin cambios.
- Regla 5: persona con usuario de nombre distinto → **error en el reporte, no crea, no cambia el username** ("una vez asignado no puede cambiarse").

**Fix del OBS-01 (PR #2143), commits `0991ed4cf` ("bloquear reasignación de usuario a otra persona") + `20bc947b5` ("bloquear creación de persona si el usuario ya pertenece a otra"):**
- Antes: si el username del Excel pertenecía a OTRA persona, el importador lo **reasignaba** (dejaba a la persona original en estado inconsistente). Ese era el OBS-01.
- Ahora: cuando el username del Excel pertenece a otra persona, el importador **agrega un error y hace `continue`** (no reasigna), y además **bloquea la creación de la persona entera** (no la da de alta). La persona original conserva su usuario intacto (`esUsuario=true`, mismo `usuario`).

## Casos de prueba

### Re-QA 2026-07-02 (vec-hotfix, tras PR #2143) — resultado final

| CA | Escenario | Resultado | Observación |
|---|---|---|---|
| OBS-01 (EL FIX de #2143) | Importar persona NUEVA (doc `727175287`) con username `qareasg175287` que ya pertenece a OTRA persona (278) | ✅ PASS | `personas_creadas:0`, `usuarios_reasignados:0`. Error: "El usuario 'qareasg175287' ya está asignado a otra persona. No se puede crear la persona." La persona original 278 conserva su usuario (`esUsuario=true`, `usuario=qareasg175287`). NO reasigna, NO crea la persona. |
| Regla 2 | Alta de persona nueva + usuario | ✅ PASS | `personas_creadas:1`, `usuarios_creados:1`. |
| Regla 4 | Idempotente — misma persona, mismo username (`qareasg175287`) | ✅ PASS | `usuarios_existentes:1`, advertencia "ya existía vinculado a persona 278". |
| Regla 5 | Misma persona, username distinto (`qareasgv2new`) | ✅ PASS | `usuarios_creados:0`. Error: "La persona ya tiene el usuario 'qareasg175287' asignado. El usuario 'qareasgv2new' no fue creado." |

**Resultado global re-QA: 4/4 PASS. Card FINALIZADA.** El OBS-01 que había dejado la card On Hold quedó resuelto por PR #2143: el escenario que antes reasignaba (dejando estado inconsistente) ahora bloquea la operación con error y no crea la persona.

### Ejecución original (vec-hotfix, PR #2135) — histórico

Dejó la card On Hold por OBS-01. Se conserva por trazabilidad:

| CA | Escenario | Resultado | Observación |
|---|---|---|---|
| SETUP/CA2 | Regla 2 — alta de persona nueva + usuario | ✅ PASS | Doc `3900124338`, usuario `qatestvec3392`. `personas_creadas:1`, `usuarios_creados:1`, se generó `access_link`. Persona 275. |
| CA1 | Regla 5 — misma persona (doc `3900124338`), username DISTINTO `qatest3392b` | ✅ PASS | `usuarios_creados:0`, `personas_reutilizadas:1`. Error: "La persona ya tiene el usuario 'qatestvec3392' asignado. El usuario 'qatest3392b' no fue creado". |
| CA4 | Regla 4 — misma persona, mismo username `qatestvec3392` (idempotencia) | ✅ PASS | `usuarios_existentes:1`, `usuarios_creados:0`, advertencia "Usuario ya existía vinculado a persona 275". |
| CA3 | Borde — persona NUEVA (277) con username `qatestvec3392` ya perteneciente a persona 275 | 📋 OBS-01 (luego resuelto) | En #2135 REASIGNABA (`usuarios_reasignados:1`), dejando a 275 en `esUsuario=true`/`usuario=null`. **Corregido en #2143** (ahora bloquea). |

## Datos de prueba usados (vec-hotfix)

**Re-QA 2026-07-02:**

| Persona | Doc | Usuario | Notas |
|---|---|---|---|
| 278 | `727175287`... (username origen) | `qareasg175287` | Persona dueña del username reusado. Tras el re-QA conserva su usuario intacto (`esUsuario=true`). |
| (bloqueada) | `727175287` | intento `qareasg175287` (de 278) | OBS-01: la creación se bloqueó (`personas_creadas:0`), no se dio de alta. |

**Ejecución original (PR #2135):**

| Persona | Doc | Usuario | Notas |
|---|---|---|---|
| 275 | `3900124338` (DNI) | `qatestvec3392` | Alta en SETUP/CA2. Tras CA3 (con #2135) quedó `esUsuario=true`/`usuario=null` (inconsistente, corregido a nivel código por #2143). |
| 277 | `380799088` (DNI) | `qatestvec3392` (reasignado) | Alta en CA3; recibió el usuario reasignado desde 275 (comportamiento previo al fix). |

## Gotchas

1. **HTTP 200 con errores por fila.** El importador devuelve `200` aun cuando hay errores de negocio por fila (viven en el array `errores` del body). **Nunca assertar solo por status HTTP.** Verificar siempre `stats` (personas_creadas, usuarios_creados, usuarios_existentes, usuarios_reasignados, personas_reutilizadas) + `errores` + `advertencias`.
2. **PERSONAS_IMPORTAR no está en ADMINISTRADOR VF (id 100).** En vec-hotfix ese permiso lo tiene `GESTOR FROTA` (id 1012), no el perfil de stineo. Para ejecutar hay que otorgarlo al perfil 100: por API (`PUT /perfiles/100`, restaurando los 373 permisos originales al finalizar) o por SQL (`INSERT INTO \`vec-hotfix\`.perfil_permisos (perfil_id, permiso_id) SELECT 100, id FROM \`vec-hotfix\`.permisos WHERE codigo = 'PERSONAS_IMPORTAR'`). Registrar el set original antes de modificar. El endpoint también exige `PERSONAS_CREAR`.
3. **`buildDocKey` requiere `documento_tipo` válido.** Resuelve el tipo (ej. "DNI") contra la tabla `documento_tipos` vía `getIdFromTable`. Si el tipo del Excel no matchea, la clave de identidad queda vacía y puede provocar falsos no-matches (persona tratada como nueva). Verificar que `documento_tipo` sea un valor válido de la tabla.
4. **Formato del Excel.** Hoja `personas`; requeridas: nombre/apellido/documento_tipo/documento_numero/base/es_activo/es_usuario. Cuando `es_usuario=SI` agregar: usuario/perfil/notificaciones_activas/email. En vec-hotfix la base es `BASE DEFAULT` (id 1) y el perfil usado fue `MONOUSUARIO`.
5. **`GET /api/personas` (listado) devuelve 403 DISABLED_SERVICE.** Usar `GET /personas/{id}`, `/personas/select` o `/personas/grid` para verificar estado.
6. **Auth en vec-hotfix.** Header `Authorization-Token`; el token viene en `resp.token` (no en `resp.usuario.token`).
7. **Campo multipart del import = `file`.** `POST /api/personas/importar-excel` espera el archivo en un campo multipart llamado exactamente `file`. Otro nombre falla. Generar el xlsx con node + la lib `xlsx` de `vecfleet-automation-test/node_modules/xlsx`.

## Observaciones

- **OBS-01 — RESUELTO (PR #2143).** Originalmente: la reasignación por username (persona nueva que reusa el username de otra) NO estaba cubierta por el fix de #2135 y dejaba a la persona original en estado inconsistente (`esUsuario=true`/`usuario=null`). Julian lo corrigió en **PR #2143** (commits `0991ed4cf` + `20bc947b5`): ahora, cuando el username pertenece a otra persona, el importador agrega error, hace `continue` (no reasigna) y bloquea la creación de la persona entera. Verificado en el re-QA del 2026-07-02: `personas_creadas:0`, `usuarios_reasignados:0`, error "El usuario '...' ya está asignado a otra persona. No se puede crear la persona.", persona original intacta. **PASS.**
- **OBS-02 (cobertura de tests):** `tests/integration/Personas/PersonasImportTest.php` no tiene test del caso del fix (reglas 4/5, gate por persona). Sugerir agregarlo para prevenir regresión.

## QA Report
VEC-3441 (Tarea, Done, link "Test" a la madre VEC-3392) — https://vecfleet-kanban.atlassian.net/browse/VEC-3441
VEC-3392 — https://vecfleet-kanban.atlassian.net/browse/VEC-3392
