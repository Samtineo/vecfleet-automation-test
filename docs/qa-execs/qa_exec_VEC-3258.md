---
name: qa-exec-vec-3258
description: "Ejecución QA VEC-3258 — Error de validación clasificacion al recotizar presupuestos con ítems ya clasificados"
metadata:
  node_type: memory
  type: project
  originSessionId: current
---

## Feature / Bug

Al cargar un presupuesto en modo detallado para recotizar, el frontend leía `pItem.idItemClasificacion` (camelCase) del response de `GET /ticket-presupuestos/ticket/{id}/items-activos`. Pero `PresupuestoItemRepository::getByPresupuestoId()` usa `->get()->toArray()` que devuelve snake_case (`id_item_clasificacion`), no el camelCase de `jsonSerialize()`. Resultado: la clasificación se enviaba como `null` → backend tiraba "clasificacion_requerida".

**Fix (branch `bugfix-vec-3258`, solo frontend):** Cambio en `TicketPresupuestoDetallado.js` líneas 128, 199, 256:
```javascript
// Antes (bug):
'id_clasificacion': pItem.idItemClasificacion || null,

// Después (fix):
'id_clasificacion': pItem.id_item_clasificacion || (pItem.clasificacion && pItem.clasificacion.id) || null,
```

## Prerrequisitos

| Item | Valor |
|---|---|
| Entorno | vec-dev |
| Ticket de prueba | ID 300 (estado RECOTIZAR) |
| Presupuesto activo | ID 364 (Pendiente, tipoRecotizacion=parcial) |
| Config requerida | `tickets.presupuesto.tipo = detallado` + `clasificacion` en `tickets.presupuesto.items.obligatorios` |
| Auth | `POST /public/auth/login` → `resp.usuario.token` |

**Config SQL aplicada antes de QA:**
```sql
-- Cambiar tipo a detallado (hecho vía UI)
-- Agregar clasificacion a obligatorios:
UPDATE config_business SET valor = 'descripcion,cantidad,costo,clasificacion'
WHERE parametro = 'obligatorios' AND seccion = 'tickets' AND grupo = 'presupuesto' AND subgrupo = 'items';
```

**Estado del presupuesto 364 en items-activos antes de QA:**
- Item 250 (REPUESTO CCF): `id_item_clasificacion: 2` (snake_case, ✅) pero `idItemClasificacion: ''` (camelCase, vacío ← bug raíz)
- Item 251 (Mano de Obra Default): `id_item_clasificacion: 6`, protegido por inmutabilidad (aprobado en presupuesto 320)
- Item 252 (FILTRO DE ACEITE): `id_item_clasificacion: null`
- Tareas 256, 257: protegidas (aprobadas en 320)

## Endpoints clave

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/ticket-presupuestos/ticket/{id}/items-activos` | Items del presupuesto activo (devuelve snake_case via toArray) |
| POST | `/ticket-presupuestos/ticket/{ticketId}` | Crear/editar presupuesto (form-urlencoded) |

## Resultados QA — 3/3 PASS

| CA | Descripción | Resultado | Evidencia |
|---|---|---|---|
| CA1 | Bug reproduced: enviar null id_clasificacion → "clasificacion_requerida" | ✅ PASS | HTTP 400 `presupuestosService.errors.clasificacion_requerida` |
| CA2 | Fix: enviar id_clasificacion=2 (desde id_item_clasificacion) → presupuesto aceptado | ✅ PASS | HTTP 201, presupuesto 364 actualizado |
| CA3 | Ítem nuevo (FILTRO DE ACEITE) con id_clasificacion explícito también funciona | ✅ PASS | HTTP 201, presupuesto 364 actualizado con 3 ítems |

**QA Report:** VEC-3294 ✅

## Gotchas críticos

- **`getInstanceFromRequest` tira `Exception` (no `BadRequestException`) cuando ya existe un presupuesto Pendiente y no se pasa `idPresupuesto`** → explota con HTTP 500 vacío. Solución: siempre pasar `idPresupuesto=<id>` cuando se edita un presupuesto Pendiente existente. Bug secundario: debería tirar 422 con mensaje descriptivo, no 500.
- **`toArray()` vs `jsonSerialize()`**: `PresupuestoItemRepository::getByPresupuestoId()` usa `->get()->toArray()` que devuelve snake_case. `jsonSerialize()` devuelve camelCase pero solo aplica en serialización JSON directa del modelo. Los consumers que usan `toArray()` obtienen snake_case.
- **external_code requerido para inmutabilidad**: `calcularLookupKeyItem` usa `external_code` como clave primaria. Si el DB tiene `external_code="1001"` para Mano de Obra Default pero el payload no lo incluye, el lookup falla con "item_aprobado_no_se_puede_eliminar". Incluir siempre `external_code` en el payload.
- **form-urlencoded obligatorio**: igual que VEC-3203. `POST /ticket-presupuestos/ticket/{id}` no parsea JSON. Usar notación PHP (`presupuestoItems[0][campo]=valor`).
- **costo_fijo items**: REPUESTO CCF (costo=20000) y Mano de Obra Default (costo=1000) tienen `costo_fijo=1` → validación `validarItemsCostoFijoNoModificable` falla si se envía precio diferente.

## Deuda técnica detectada

- `getInstanceFromRequest` línea 268-269: `throw new Exception(...)` en vez de `throw new BadRequestException(...)` → HTTP 500 en vez de 422 cuando ya existe presupuesto Pendiente.
- [[module-tickets]] `PresupuestoItemRepository::getByPresupuestoId()` usa `toArray()` (snake_case) en vez de `jsonSerialize()` (camelCase) — inconsistencia entre este endpoint y otros que usan la serialización del modelo. TODO VEC-3278: unificar.
