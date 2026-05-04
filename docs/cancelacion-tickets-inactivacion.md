# Cancelación de Tickets al Inactivar Móviles — VEC-3087

## 1. Descripción del bug

**Reportado por:** Telecom/Personal  
**Síntoma:** Móviles inactivos continúan disparando tickets PREVENTIVOS y VENCIMIENTOS.  
**Causa raíz:** Al inactivar un vehículo, los controles activos (preventivos/vencimientos) quedaban vigentes. Cuando sus condiciones de disparo se cumplían (por fecha o km), el cron generaba nuevos tickets para un vehículo ya inactivo.

---

## 2. Fix implementado

### Flujo de corrección (`TicketsService::cancelarPorInactivacionMovil`)

Al inactivar un vehículo, si `moviles.cancelacionTicketsAlInactivar.habilitado = true`:

1. Obtiene todos los tickets en estado **no CANCELADO / no CERRADO** para el móvil
2. Por cada ticket:
   - Asigna motivo "Cancelación automática por inactivación de vehículo"
   - Cambia estado a **CANCELADO**
   - **VENCIMIENTO** → desvincula `vencimientos.ticket = NULL` (`updateOnCancel`)
   - **PREVENTIVO** → desvincula `preventivos.ticket_id = NULL`
   - Para ambos tipos: `updateProximasTareas()`
   - Agrega comentario automático en el ticket
   - Registra entrada en historial

### Entry points que invocan `cancelarPorInactivacionMovil`

| Método | Endpoint |
|---|---|
| `MovilesService::update()` | `PUT /moviles/{id}` |
| `MovilesService::updateEstado()` | `PUT /moviles/{movilId}/estado` |
| `MovilesService::patchMovil()` (via updateEstado) | `PATCH /moviles/{movilId}` |

---

## 3. Requisitos de configuración

### 3.1 Config-business (requisito crítico)

```
moviles.cancelacionTicketsAlInactivar.habilitado = true
```

Sin este flag, la inactivación funciona con HTTP 200/204 pero los tickets **no se cancelan**. No hay error visible.

### 3.2 Migración de base de datos

La migración `20260409000001_add_motivo_cancelacion_inactivacion_vehiculo` debe ejecutarse en el entorno. Crea el registro en la tabla `motivos`:

- **nombre:** `Cancelación automática por inactivación de vehículo`
- **tipo_motivo_id:** `TipoMotivos::ID_CANCELACION`

Sin esta migración, el motivo no se asigna al ticket (se usa `null`) pero la cancelación igual ocurre si el flag está activo.

---

## 4. Cobertura de los crón de generación (análisis)

| Cron | Filtra movil inactivo | Estado |
|---|---|---|
| `GeneracionTicketsVencimiento` | Sí (`mov.activo = 1 AND mov.estado IN (estadosActivos)`) | ✅ No genera para inactivos |
| `GeneracionTicketsPreventivos` (con plan) | Sí (`getMovilesConPreventivosPendientes` → `movil.activo = 1`) | ✅ No genera para inactivos |
| `GeneracionTicketsPreventivos` (sin plan) | **No** — join a moviles pero sin filtro `moviles.activo` | ⚠️ Gap residual para preventivos sin plan con km ya alcanzado |

---

## 5. Casos de prueba — VEC-3087

**Entorno:** `personal-test.vecfleet.io` (teco-test)  
**Script:** `scripts/teco-test-tc-3087.js`

```bash
node scripts/teco-test-tc-3087.js
```

| TC | Descripción | Verificación |
|---|---|---|
| TC-01 | Config flag `cancelacionTicketsAlInactivar.habilitado = true` | `GET /config-business` → `moviles.cancelacionTicketsAlInactivar.habilitado = true` |
| TC-02 | Motivo de cancelación existe en el sistema | `GET /motivos?tipoMotivo=CANCELACION` → nombre exacto presente |
| TC-03 | Inactivar vehículo con PREVENTIVO abierto → ticket CANCELADO | `PUT /moviles/{id}/estado` activo=false → tickets pasan a CANCELADO, ninguno queda abierto |
| TC-04 | Inactivar vehículo con VENCIMIENTO abierto → ticket CANCELADO | ídem TC-03 para tipo VENCIMIENTO |
| TC-05 | Ticket cancelado tiene comentario automático | `GET /ticket-comentarios/ticket/{id}/grid` → comentario "Cancelación automática por inactivación de vehículo" presente |
| TC-06 | Ticket cancelado tiene motivo asignado | `GET /tickets/{id}` → `motivoCancelacion` not null |
| TC-07 | Inactivar vehículo SIN tickets activos → sin error | HTTP 200/204, sin 500 |
| TC-08 | Reactivar vehículo → `activo=true` correcto | `GET /moviles/{id}` → `activo=1` |

---

## 6. Blockers identificados en personal-test (2026-05-04)

| Blocker | Síntoma | Acción requerida |
|---|---|---|
| Flag deshabilitado / ausente | TC-01 FAIL — `cancelacionTicketsAlInactivar` no existe en config-business | DevOps: agregar `moviles.cancelacionTicketsAlInactivar.habilitado = true` |
| Migración no ejecutada | TC-02 FAIL — motivo no encontrado en tabla `motivos` | DevOps: ejecutar `20260409000001_add_motivo_cancelacion_inactivacion_vehiculo` |
| Sin datos de prueba | TC-03 a TC-08 SKIP — no hay moviles con PREVENTIVO/VENCIMIENTO abierto | Crear tickets de prueba o hardcodear IDs en el script |

---

## 7. Historial de ejecuciones

| Fecha | Entorno | TC-01 | TC-02 | TC-03 | TC-04 | TC-05 | TC-06 | TC-07 | TC-08 |
|---|---|---|---|---|---|---|---|---|---|
| 2026-05-04 | personal-test | FAIL (flag ausente) | FAIL (migración) | SKIP | SKIP | SKIP | SKIP | SKIP | SKIP |
