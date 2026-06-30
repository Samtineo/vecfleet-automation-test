---
name: qa-exec-VEC-3171
description: "Ejecución QA de VEC-3171 — Tickets Presupuesto Simple: marcar tareas al cerrar y generar ticket derivado"
metadata:
  type: project
  originSessionId: current
---

## Feature
Al pasar un ticket correctivo a "Listo para Retirar" + sobreescribir presupuesto, el sistema presenta el modal `#tareas_cierre_modal` donde el usuario elimina las tareas no realizadas. Después de la fecha de cierre aparece el dialog "Items sin realizar" y luego el form "Generar ticket correctivo derivado".

**Prerequisitos:** `presupuesto.tipo = simple`, `tareasCierre.habilitado = true`, `trabajaConRepuestos = false`, `trabajaConManoDeObra = false`.

**QA Report:** pendiente

## Endpoints del feature

| Paso | Endpoint | Body clave |
|---|---|---|
| 1. Guardar fecha | `POST /tickets/update-realizado/{id}` | `{id, fechaHoraRealizado, kmRealizado}` |
| 2. Listo para Retirar | `POST /tickets/listo-para-retirar/{id}` | `{id:0, tareas:[tareas_realizadas], servicio:{id}}` |
| 3. Crear derivado | `POST /tickets/{id}/crear-derivado` | `{titulo, itemsSeleccionados:[], tareasSeleccionadas:[{id, servicio_id, ...}], servicioId}` |
| Response derivado | `{codigo:201, data:{ticketDerivadoId}}` | — |

**Notas sobre `listo-para-retirar`:** el array `tareas` contiene las tareas REALIZADAS (las que el usuario mantuvo en el modal). Las tareas ELIMINADAS del modal son las no realizadas.

## Flujo UI

1. Clic "Listo para Retirar" → dialog "¿Sobrescribir presupuesto?" → "Si"
2. Modal `#tareas_cierre_modal`: lista de tareas con botón eliminar (🗑️ `i[class*="trash"]`)
3. Eliminar tareas no realizadas → "Guardar"
4. Modal "Informar Fecha de Realizado" → "Guardar"
5. Dialog "Items sin realizar" — "¿Querés generar un ticket correctivo derivado?" → "Sí, generar ticket"
6. Form "Generar ticket correctivo derivado": campos `Título*`, `Servicio*`, tabla de tareas con checkbox → "Crear ticket derivado"

## Selectores UI

- Botón acción: `div[data-original-title="Listo para Retirar"]` (Bootstrap mueve `title` a `data-original-title`)
- Modal tareas: `#tareas_cierre_modal`
- Botón confirmar derivado: `button:has-text("Crear ticket derivado")`
- Título derivado input: `input[placeholder*="ticket"]`

## Setup de prueba

```bash
# Crear ticket con múltiples tareas
POST /tickets {ticketTipo:CORRECTIVO, movil:{id:25}, servicio:{id:38},
  tarea:{id:584, servicio:{id:38}},
  tareas:[{id:584, svc:38}, {id:13, svc:2}]}
# Presupuesto Simple
POST /ticket-presupuestos/ticket/{id} {repuestos:100, manoDeObra:0, servicioId:38}
# Flujo
POST /tickets/aprobar/{id}
POST /tickets/enviar-a-reparar/{id}
POST /tickets/update-realizado/{id} {fechaHoraRealizado:"..."}
# Marcar tarea 13 como realizada, 584 como no realizada
POST /tickets/listo-para-retirar/{id} {tareas:[{id:13, servicio:{id:2}}], servicio:{id:38}}
# Crear derivado con tarea no realizada (584)
POST /tickets/{id}/crear-derivado {titulo:"...", tareasSeleccionadas:[{id:584, servicio_id:38}], servicioId:38}
```

## Actualizar servicio maxTicketsParalelo (CA04-CA06)

Solo funciona con `application/x-www-form-urlencoded` (el gotcha VEC-3203 aplica aquí también):

```bash
curl -X PUT $BASE/servicios/{id} \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization-Token: $TOKEN" \
  --data-urlencode "nombre=AUXILIO MECÁNICO" \
  -d "ticketTipo[id]=2&ticketTipo[nombre]=CORRECTIVO&activo=true&..&maxTicketsParalelo=1&.."
```

Solo aparece el campo "Máx. tickets activos" en servicios de tipo **CORRECTIVO** (no en PREVENTIVO).

## Resultados

| CA | Estado | Detalles |
|---|---|---|
| CA01 | ✅ PASS | Modal `#tareas_cierre_modal` visible con lista de tareas y botones eliminar |
| CA02 | ✅ PASS | HTTP 201, `ticketDerivadoId`, vinculado con `ticketOrigenId`, estado ABIERTO, tipo CORRECTIVO |
| CA02b | ✅ PASS | Título vacío → `"titulo must not be empty"`. Título solo espacios → igual |
| CA03 | ✅ PASS | `tareasSeleccionadas:[]` → `"ticketsDerivados.seleccion_vacia"`, 0 derivados creados |
| CA04 | ✅ PASS | `activos < max` → HTTP 201, derivado creado sin bloqueo |
| CA05 | ✅ PASS | `activos >= max` + tarea alternativa: svc2 → HTTP 400, svc38 → HTTP 201 ✓ |
| CA06 | ✅ PASS | `activos >= max` + sin alternativa: HTTP 400 definitivo |

## Incompatibilidad de config documentada

- `presupuesto.tipo=simple` + `trabajaConManoDeObra=true` → **incompatible**: con MO activo el presupuesto simple no tiene tareas y la feature no funciona
- `presupuesto.tipo=detallado` → CA07: el modal `#tareas_cierre_modal` SIGUE apareciendo si `tareasCierre.habilitado=true`. La condición real es `tareasCierre.habilitado`, no el tipo de presupuesto
- Campo "Máx. tickets activos" solo aparece en la UI para servicios CORRECTIVO, no PREVENTIVO

## Datos de prueba vec-dev

| Recurso | Valor |
|---|---|
| Móvil de prueba | ID 25 (430ZBV) |
| Servicio PREVENTIVO | ID 38 (SERVICIO TEMPLATE #001), tarea 584 |
| Servicio CORRECTIVO | ID 2 (AUXILIO MECÁNICO), tarea 13 (ACARREO) |
| Servicio CORRECTIVO | ID 5 (CERRAJERÍA), tarea 24 (CABLE COMANDO CAPOT) |

## Tests E2E

Ver `tests/VEC-3171-tickets-tareas-cierre/` en `vecfleet-automation-test`.
