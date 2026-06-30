---
name: qa-exec-VEC-3266
description: "QA Exec para Submódulo de Reglas (alertas/bloqueos) de Períodos de Presupuesto. Entorno vec-dev."
metadata:
  node_type: memory
  type: project
  originSessionId: current
---

## Entorno
- **vec-dev**. Credenciales: usuario `stineo`, token via `POST /public/auth/login` (token en `resp.usuario.token`).
- Feature: submódulo de **Reglas** dentro de Períodos de Presupuesto (PR #2099, Matias Sosa). Implementación del diseño previo VEC-3377.
- Config relevante: `periodoPresupuestario.habilitado` (gobierna SOLO la visibilidad UI del submódulo; ver gate abajo).

## Prerrequisitos
1. Config `periodoPresupuestario.habilitado = true` en `config_business` — necesaria solo para ver el submódulo en la UI. Los endpoints NO dependen de esta config (se protegen solo por permiso).
2. Existir una `periodos_config` activa para el tenant. En vec-dev se usó **id=4 "QA-VEC3266"**.
3. Asignar al perfil de prueba los **3 permisos de Reglas** (independientes, NO AND):
   - `PERIODO_PRESUPUESTARIO_REGLAS_VER` → habilita GET
   - `PERIODO_PRESUPUESTARIO_REGLAS_CREAR_EDITAR` → habilita POST y PUT
   - `PERIODO_PRESUPUESTARIO_REGLAS_ELIMINAR` → habilita DELETE
   - Definidos en `Security/Permisos.php:553-555`.
4. Perfil de prueba en vec-dev: **719** (con los 3 permisos de reglas restaurados). Para boundaries de permisos se crearon perfiles **742-745** (sin usar en la ejecución final, borrables).

## Endpoints usados
| Método | Endpoint | Para qué | Permiso requerido |
|---|---|---|---|
| GET | `/api/periodo-reglas` | Listar reglas | `..._REGLAS_VER` |
| POST | `/api/periodo-reglas` | Crear regla | `..._REGLAS_CREAR_EDITAR` |
| PUT | `/api/periodo-reglas/{id}` | Editar regla | `..._REGLAS_CREAR_EDITAR` |
| DELETE | `/api/periodo-reglas/{id}` | Eliminar regla (soft delete) | `..._REGLAS_ELIMINAR` |

### Modelo de regla (`periodos_reglas`)
| Campo | Tipo | Detalle |
|---|---|---|
| `nombre` | string | Nombre de la regla |
| `porcentaje_umbral` | tinyint | **Entero estricto 1-100** |
| `accion_notificacion` | boolean | Acción notificación |
| `accion_bloqueo` | boolean | Acción bloqueo |
| `activa` | boolean | Toggle activa/inactiva |
| softDeletes | — | DELETE es soft (deleted_at) |

### Validaciones backend
- `porcentaje_umbral`: entero estricto 1-100. `0`, vacío, `>100`, decimal o texto → **400**.
- Al menos una acción obligatoria: si `accion_notificacion` y `accion_bloqueo` ambas en `false` → **400**.

## Casos de prueba

### API — 19/19 PASS
| CA | Escenario | Resultado | Observación |
|---|---|---|---|
| 01 | GET listado de reglas | ✅ PASS | |
| 02 | POST crear regla válida | ✅ PASS | |
| 03 | PUT editar regla existente | ✅ PASS | |
| 04 | DELETE eliminar regla (soft) | ✅ PASS | deleted_at poblado, no loguea |
| 05 | Umbral borde = 1 | ✅ PASS | Límite inferior aceptado |
| 06 | Umbral borde = 100 | ✅ PASS | Límite superior aceptado |
| 07 | Umbral = 0 | ✅ PASS (rechazo 400) | |
| 08 | Umbral vacío | ✅ PASS (rechazo 400) | |
| 09 | Umbral > 100 | ✅ PASS (rechazo 400) | |
| 10 | Umbral decimal | ✅ PASS (rechazo 400) | Entero estricto |
| 11 | Umbral texto | ✅ PASS (rechazo 400) | |
| 12 | Solo notificación (bloqueo off) | ✅ PASS | Una acción basta |
| 13 | Solo bloqueo (notificación off) | ✅ PASS | Una acción basta |
| 14 | Ambas acciones off | ✅ PASS (rechazo 400) | Al menos una obligatoria |
| 15 | Toggle `activa` true/false | ✅ PASS | |
| 16 | Reglas duplicadas (mismo umbral) | ✅ PASS (permitido) | Ver OBS-A |
| 17 | Permisos granulares → 403 sin permiso | ✅ PASS | Permisos independientes (no AND) |
| 18 | Período iniciado y período cerrado → CRUD permitido | ✅ PASS | Ver OBS-A |
| 19 | 3 smoke tests de regresión PP | ✅ PASS | |

### UI — PASS
| CA | Escenario | Resultado |
|---|---|---|
| CA6 | Cancelar eliminación (modal) | ✅ PASS |
| CA7 | Cancelar crear/editar (modal) | ✅ PASS |

### Logs de auditoría — verificados en DBeaver, PASS
| CA | Escenario | Resultado | Observación |
|---|---|---|---|
| CA12 | Log de creación | ✅ PASS | `datos_antes` NULL + `datos_despues` poblado |
| CA13 | Log de edición | ✅ PASS | `datos_antes` (previo) + `datos_despues` (nuevo); captura cambios reales |
| CA14 | DELETE no loguea | ✅ PASS | enum `accion` solo `creacion`/`edicion`; soft delete no genera log |

## Tablas DB
- **`periodos_reglas`**: `nombre`, `porcentaje_umbral` (tinyint 1-100), `accion_notificacion`, `accion_bloqueo`, `activa`, softDeletes.
- **`periodos_reglas_log`**: `regla_id`, `usuario_id`, `accion` (enum `creacion`/`edicion`), `datos_antes` (json), `datos_despues` (json). `created_at` del log en **hora local ART (UTC-3)**.

## Gate de config
`periodoPresupuestario.habilitado` gobierna **SOLO la visibilidad UI** del submódulo Reglas. Los endpoints `/api/periodo-reglas/*` se protegen únicamente por permiso. Con la config en `false` pero permiso asignado, los endpoints siguen respondiendo 200 (ver OBS-B).

## Gotchas
- **Auth:** token en `resp.usuario.token` tras `POST /public/auth/login`.
- **Umbral entero estricto:** un decimal como `50.5` se rechaza con 400. No redondea. Para CAs de borde usar exactamente `1` y `100` (aceptados) y `0`/`101` (rechazados).
- **Al menos una acción:** crear/editar con ambas acciones en `false` retorna 400. Siempre setear al menos `accion_notificacion` o `accion_bloqueo`.
- **DELETE no loguea:** el enum de `periodos_reglas_log.accion` solo admite `creacion`/`edicion`. Un soft delete no deja rastro en el log de auditoría — esto es esperado, no es bug.
- **Logs en ART (UTC-3):** `created_at` del log ya viene en hora local, no UTC. Al verificar en DBeaver no restar 3h. (Contraste con [[qa-technique-timezone]] que aplica a otros timestamps.)
- **CRUD en cualquier estado del período:** se puede crear/editar/eliminar reglas con el período iniciado o cerrado. Es decisión de negocio explícita del dev, aunque contradice la descripción de la card (ver OBS-A).
- **Duplicados permitidos:** se pueden crear múltiples reglas con el mismo umbral. También decisión de negocio (ver OBS-A).
- **Permisos independientes:** los 3 permisos NO funcionan como AND gate. Tener `..._VER` sin `..._CREAR_EDITAR` permite listar pero no crear (403 al crear). Cada verbo HTTP está gateado por su propio permiso.

## Observaciones (no bloqueantes)
- **OBS-A:** la descripción de la card dice "solo mientras el período no haya iniciado" y "un único umbral", pero la implementación permite CRUD en cualquier estado del período y reglas duplicadas. Decisión de negocio explícita del dev (Matias Sosa, 2026-06-22). Recomendación: actualizar la descripción de la card para reflejar el comportamiento real.
- **OBS-B (candidata a INC-007, NO registrada):** los endpoints `/api/periodo-reglas/*` no están gateados por `periodoPresupuestario.habilitado`, solo por permiso. Es la misma deuda técnica ya documentada de PP (`ValidatePermissionsMiddleware`), riesgo bajo. **NO registrar INC nueva** — ya cubierto.
- **OBS-C (estética/UX):** las etiquetas de estado en las columnas `% umbral` y `estado` de la grilla no son consistentes con el design system existente (ej. módulo Vehículos); los íconos de alarma y bloqueo son de baja calidad visual. No bloqueante. Candidato a El Diseñador.

## Datos creados en vec-dev (para limpieza/regresión)
- `periodos_config` **id=4 "QA-VEC3266"**.
- Reglas ids **1, 4-11** (vigentes) + soft-deletes **2, 12**.
- Perfiles boundary **742-745** (sin usar en la ejecución final, borrables).
- Perfil **719** con los 3 permisos de reglas restaurados.

## QA Report
VEC-3266 — comentario en la card (no se creó card separada). Comentario id **140415**. Etiqueta `test`. Card transicionada a Finalizada.
https://vecfleet-kanban.atlassian.net/browse/VEC-3266
