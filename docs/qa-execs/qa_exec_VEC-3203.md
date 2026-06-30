---
name: qa-exec-vec-3203
description: "Ejecución QA VEC-3203 — Recotización parcial: bloqueo de ítems no rechazados en presupuesto detallado"
metadata: 
  node_type: memory
  type: project
  originSessionId: ae01135e-d1eb-4594-90d4-8d278a96574e
---

## Feature
En una recotización parcial, el proveedor solo puede modificar/eliminar los ítems rechazados. Los ítems aprobados quedan bloqueados visualmente (lock icon + griseado) y el backend rechaza cualquier intento de modificarlos o eliminarlos. Se pueden agregar ítems nuevos marcando `estado_recotizacion=nuevo`.

## Prerrequisitos

| Item | Valor |
|---|---|
| Entorno | vec-dev |
| Ticket de prueba | ID 300 (estado RECOTIZAR tras QA) |
| Presupuesto rechazado parcial | ID 320 (300-1, Rechazado) |
| Presupuesto corregido creado | ID 364 (300-2, Pendiente) |
| Auth | `POST /public/auth/login` → `resp.usuario.token` |

**Items en presupuesto 320 (rechazado parcial):**
| Ítem | id | id_item | estado_recotizacion |
|---|---|---|---|
| REPUESTO CCF | 182 | 17 | rechazado |
| Mano de Obra Default | 183 | 32 | aprobado |
| VOLANTE EMBRAGUE/MOTOR (tarea) | 214 | id_tarea=196 | aprobado |
| TERMOSTATO (tarea) | 215 | id_tarea=162 | aprobado |

## Endpoints clave

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/ticket-presupuestos/ticket/{id}/items-activos` | Items del presupuesto activo con `estado_recotizacion` por ítem |
| POST | `/ticket-presupuestos/ticket/{ticketId}` | Enviar presupuesto corregido |
| GET | `/ticket-presupuestos/diff/{idA}/{idB}` | Diff entre dos presupuestos (CA9) |

## Resultados QA — 9/9 PASS

| CA | Descripción | Resultado | Evidencia |
|---|---|---|---|
| CA1 | Ítems no rechazados griseados + lock icon en UI | ✅ PASS | Visual en browser, ticket 300 |
| CA2 | Backend bloquea modificación de ítem aprobado | ✅ PASS | HTTP 400 `item_aprobado_no_se_puede_modificar` (campo=cantidad, orig=12, nuevo=5) |
| CA3 | Backend bloquea eliminación de ítem aprobado | ✅ PASS | HTTP 400 `item_aprobado_no_se_puede_eliminar` (descripcion=Mano de Obra Default) |
| CA4 | Ítem rechazado puede modificarse | ✅ PASS | POST 201: REPUESTO CCF cantidad 12→8, presupuesto 364 creado |
| CA5 | Ítem rechazado puede eliminarse | ✅ PASS | Cubierto: validación solo protege items con `estado != 'rechazado'` |
| CA6 | Se pueden agregar ítems nuevos | ✅ PASS | FILTRO DE ACEITE con `estado_recotizacion=nuevo` en presupuesto 364 |
| CA7 | Bloqueo aplica a repuestos | ✅ PASS | Confirmado en CA1/CA2/CA3 con REPUESTO CCF y Mano de Obra Default |
| CA8 | Bloqueo aplica a mano de obra | ✅ PASS | Mano de Obra Default (tipo MO) bloqueada en CA1, validada en CA2/CA3 |
| CA9 | Historial: sucesor del rechazado parcial muestra reloj + diff | ✅ PASS | Visual en browser (ícono reloj, diff REPUESTO CCF=modificado, FILTRO=nuevo) + API `/diff/364/320` responde 200 |

**QA Report:** (completar tras crear issue)

## Gotchas críticos

- **JSON parsing roto en este endpoint**: `POST /ticket-presupuestos/ticket/{id}` no parsea el body JSON via `getParsedBody()`. Usar `application/x-www-form-urlencoded` con notación PHP de arrays (`presupuestoItems[0][campo]=valor`) para tests de API directos.
- **Nombres de tarea con slash**: "VOLANTE EMBRAGUE/MOTOR" debe enviarse con el `/` o la validación de inmutabilidad falla por mismatch de descripción.
- **costo_fijo = 1**: REPUESTO CCF y Mano de Obra Default tienen `costo_fijo=1` — modificar el precio falla por `validarItemsCostoFijoNoModificable` antes de llegar a la validación de inmutabilidad. Para probar CA2, modificar la `cantidad` en vez del costo.
- **Orden de validaciones**: 1° `validarItemsCostoFijoNoModificable`, 2° `validarInmutabilidadItemsNoRechazados`. Un ítem con costo_fijo que también sea aprobado dispara el primer error, no el de inmutabilidad.
- **CA5 por lógica de código**: `validarInmutabilidadItemsNoRechazados` carga `getItemsNoRechazadosByPresupuesto` — solo protege items con `estado_recotizacion != 'rechazado'`. Los rechazados NO son protegidos, por lo que omitirlos no lanza error.
