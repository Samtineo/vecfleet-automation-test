---
name: qa-exec-VEC-3392
description: "QA Exec para VEC-3392 Personas | Importador crea múltiples usuarios para la misma persona (bug/hotfix). Entorno vec-hotfix."
metadata:
  type: project
---

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

**Permiso PERSONAS_IMPORTAR (gotcha clave):** el perfil `ADMINISTRADOR VF` (id 100) de `stineo` en vec-hotfix **NO** tiene `PERSONAS_IMPORTAR` por default. El perfil `GESTOR FROTA` (id 1012) sí lo tiene. Para ejecutar los CAs se agregó temporalmente `PERSONAS_IMPORTAR` al perfil 100 vía `PUT /perfiles/100` y **se restauró al finalizar** (373 permisos originales). El entorno quedó sin cambios residuales. Si se replica: registrar el set de permisos original antes de tocar el perfil y restaurarlo al terminar.

**Formato del Excel del importador:**
- Hoja obligatoria: `personas`.
- Columnas requeridas siempre: `nombre`, `apellido`, `documento_tipo`, `documento_numero`, `base`, `es_activo`, `es_usuario`.
- Columnas condicionales cuando `es_usuario = SI`: `usuario`, `perfil`, `notificaciones_activas`, `email`.
- `documento_tipo` debe matchear un valor válido en la tabla `documento_tipos` (ej. `DNI`). Si no matchea, la clave de identidad queda vacía (ver Gotcha 3).

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

## Casos de prueba

| CA | Escenario | Resultado | Observación |
|---|---|---|---|
| SETUP/CA2 | Regla 2 — alta de persona nueva + usuario | ✅ PASS | Doc `3900124338`, usuario `qatestvec3392`. Stats `personas_creadas:1`, `usuarios_creados:1`, se generó `access_link`. Persona 275. |
| CA1 (EL FIX) | Regla 5 — misma persona (doc `3900124338`), username DISTINTO `qatest3392b` | ✅ PASS | `usuarios_creados:0`, `personas_reutilizadas:1`. Error: "La persona ya tiene el usuario 'qatestvec3392' asignado. El usuario 'qatest3392b' no fue creado". NO crea segundo usuario. |
| CA4 | Regla 4 — misma persona, mismo username `qatestvec3392` (idempotencia) | ✅ PASS | `usuarios_existentes:1`, `usuarios_creados:0`, `errores` vacío, advertencia "Usuario ya existía vinculado a persona 275". |
| CA3 | Borde — persona NUEVA (277, doc `380799088`) con username `qatestvec3392` ya perteneciente a persona 275 | 📋 OBS-01 | El importador REASIGNA el usuario (`usuarios_reasignados:1`, advertencia "reasignado a persona 277 (antes: 275)"). Persona 275 queda `esUsuario=true` / `usuario=null` (GET /personas/275). Estado inconsistente. NO cubierto por el fix. |

**Resultado global: 3/3 CAs del fix PASS.** Fix principal verificado y correcto. CA3 es un caso de borde no cubierto por el fix (ver OBS-01).

## Datos de prueba usados (vec-hotfix)

| Persona | Doc | Usuario | Notas |
|---|---|---|---|
| 275 | `3900124338` (DNI) | `qatestvec3392` | Alta en SETUP/CA2. Tras CA3 quedó `esUsuario=true`/`usuario=null` (inconsistente). |
| 277 | `380799088` (DNI) | `qatestvec3392` (reasignado) | Alta en CA3; recibió el usuario reasignado desde 275. |

## Gotchas

1. **HTTP 200 con errores por fila.** El importador devuelve `200` aun cuando hay errores de negocio por fila (viven en el array `errores` del body). **Nunca assertar solo por status HTTP.** Verificar siempre `stats` (personas_creadas, usuarios_creados, usuarios_existentes, usuarios_reasignados, personas_reutilizadas) + `errores` + `advertencias`.
2. **PERSONAS_IMPORTAR no está en ADMINISTRADOR VF (id 100).** En vec-hotfix ese permiso lo tiene `GESTOR FROTA` (id 1012), no el perfil de stineo. Para ejecutar hay que agregarlo temporalmente al perfil 100 (`PUT /perfiles/100`) y **restaurar los 373 permisos originales al finalizar**. Registrar el set original antes de modificar.
3. **`buildDocKey` requiere `documento_tipo` válido.** Resuelve el tipo (ej. "DNI") contra la tabla `documento_tipos` vía `getIdFromTable`. Si el tipo del Excel no matchea, la clave de identidad queda vacía y puede provocar falsos no-matches (persona tratada como nueva). Verificar que `documento_tipo` sea un valor válido de la tabla.
4. **Formato del Excel.** Hoja `personas`; requeridas: nombre/apellido/documento_tipo/documento_numero/base/es_activo/es_usuario. Cuando `es_usuario=SI` agregar: usuario/perfil/notificaciones_activas/email. En vec-hotfix la base es `BASE DEFAULT` (id 1) y el perfil usado fue `MONOUSUARIO`.
5. **`GET /api/personas` (listado) devuelve 403 DISABLED_SERVICE.** Usar `GET /personas/{id}`, `/personas/select` o `/personas/grid` para verificar estado.
6. **Auth en vec-hotfix.** Header `Authorization-Token`; el token viene en `resp.token` (no en `resp.usuario.token`).

## Observaciones

- **OBS-01 (scope, no bloqueante):** la reasignación por username (CA3 — un usuario existente que pasa a una persona nueva) NO fue cubierta por el fix, pese a estar mencionada en el reporte de la card. Deja a la persona original en estado inconsistente (`esUsuario=true`/`usuario=null`). Laura confirmó que no es una convención decidida y cae en la excepción "estado inconsistente visible → reportar". Escalar a Julian Quino / PO para definir scope. **No bloquea el fix principal** (reglas 2/3/4/5 correctas).
- **OBS-02 (cobertura de tests):** `tests/integration/Personas/PersonasImportTest.php` no tiene test del caso del fix (reglas 4/5, gate por persona). Sugerir agregarlo para prevenir regresión.

## QA Report
VEC-3441 (Tarea, Done, link "Test" a la madre VEC-3392) — https://vecfleet-kanban.atlassian.net/browse/VEC-3441
VEC-3392 — https://vecfleet-kanban.atlassian.net/browse/VEC-3392
