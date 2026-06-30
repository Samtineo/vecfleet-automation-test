---
name: qa-exec-vec-2799
description: "Prerrequisitos, endpoint, CAs y gotchas para regresión de VEC-2799 Modificar servicio principal de ticket correctivo"
metadata:
  node_type: memory
  type: project
  originSessionId: fddf5493-1cbd-4827-9450-1f1d7cb5ca38
---

## Feature
Permite modificar el servicio principal de un ticket correctivo siempre que no tenga presupuesto cargado y el usuario posea el permiso. El cambio actualiza `tickets.servicio`, reemplaza `ticket_tareas`, guarda snapshot en `ticket_servicio_historico` y registra evento en `ticket_historico`.

## Prerrequisitos

| Item | Valor |
|---|---|
| Entorno | vec-dev |
| Auth | `POST /api/public/auth/login` → `resp.usuario.token` |
| Permiso | `TICKETS_CORRECTIVOS_MODIFICAR_SERVICIO_PRINCIPAL` — agregado al perfil 719 durante QA |
| Módulo UI | Tickets → detalle de ticket correctivo |

## Endpoint

```
PATCH /api/tickets/{id}/servicio-principal
Authorization-Token: <token>
Content-Type: application/json

{ "servicioId": <int>, "tareaId": <int> }
```

**Response exitoso:** 204 No Content

## Validaciones del controller (antes de llegar al service)
- `servicioId <= 0` → 400
- `tareaId <= 0` → 400

## Reglas de negocio (en service)
1. Sin permiso `TICKETS_CORRECTIVOS_MODIFICAR_SERVICIO_PRINCIPAL` → 403
2. Sin acceso por CC (`validarPermisoGestionTicket`) → 403
3. Ticket inexistente → 404
4. Ticket no CORRECTIVO → 400
5. Ticket con `presupuesto_nombre` no vacío → 400
6. Par servicio-tarea inválido (no existe en `servicio_tarea`) → 400

## DB operations en happy path
1. Snapshot de `ticket_tareas` actuales en `ticket_servicio_historico` (servicio_id, servicio_nombre, tarea_id, tarea_nombre, usuario_id, fecha_hora)
2. Evento `TICKETS_MODIFICACION_SERVICIO_PRINCIPAL` en `ticket_historico` con detalle `"Servicio: [anterior] → [nuevo]"`
3. `UPDATE tickets SET servicio = :servicioId WHERE id = :ticketId`
4. `DELETE ticket_tareas WHERE ticket = :ticketId`
5. `INSERT ticket_tareas (ticket, tarea, servicio)`

## Casos de prueba

| CA | Tipo | Descripción | Resultado |
|---|---|---|---|
| CA1 | API | Happy path — ticket 590, servicio 4→1, tarea 139→1 | ✅ PASS |
| CA2 | API | Sin permiso → 403 | ✅ PASS |
| CA3 | API | Con presupuesto (ticket 447) → 400 | ✅ PASS |
| CA4 | API | Ticket PREVENTIVO (ticket 500) → 400 | ✅ PASS |
| CA5 | API | Par inválido (servicio 1 + tarea 213 de servicio 4) → 400 | ✅ PASS |
| CA6 | API | servicioId=0 → 400 | ✅ PASS |
| CA7 | API | tareaId=0 → 400 | ✅ PASS |
| CA8 | API | Ticket inexistente (999999) → 404 | ✅ PASS |
| CA9 | UI | Ícono editar visible con permiso y sin presupuesto | ✅ PASS |
| CA10 | UI | Modal con desplegable servicios + tareas | ✅ PASS |
| CA11 | UI | Cambio refleja en detalle y grilla | ✅ PASS |
| CA12 | UI | Evento en historial "anterior → nuevo" | ✅ PASS |
| CA13 | UI | Tooltip servicio original en "Ver tareas" | ✅ PASS ⚠️ obs. |
| CA14 | UI | Sin permiso: ícono no visible | ✅ PASS |
| CA15 | UI | Con presupuesto: ícono no visible/bloqueado | ✅ PASS |

## Observación CA13
El tooltip de servicio original solo aplica cuando `tickets.trabajaConManoDeObra.habilitado = false` (modo tareas). Con la config en `true` (modo ítems), la sección "Ver tareas" no muestra tareas — los ítems de MO las reemplazan. Documentado en VEC-2799.

## Bug encontrado: 500 en ticket sin ticket_tareas
**Causa:** `TicketsService::updateServicioPrincipal()` línea 2869 hace `$ticket->getServicio()->getId()` cuando no hay tareas, pero el ticket fue cargado con `$full=false` → `getServicio()` = null → fatal error.

**Escenarios:** tickets generados desde checklist en modo ítems (detallado + MO/Repuestos habilitado), tickets creados sin tarea.

**Fix sugerido:** usar `DB::table('tickets')->where('id', $ticketId)->value('servicio')` como fallback.

**Estado:** documentado como comentario en VEC-2799. QA Report queda en On Hold hasta que el dev corrija.

## Datos de prueba (vec-dev)

| Entidad | ID | Notas |
|---|---|---|
| CORRECTIVO sin presupuesto (con tarea) | 590 | tarea 139/CARTER → servicio 4; usado en CA1 |
| CORRECTIVO con presupuesto | 447 | presupuesto=447-1; usado en CA3 |
| PREVENTIVO | 500 | estado PRESUPUESTADO; usado en CA4 |
| Servicio ACCESORIOS | 1 | par válido con tarea 1 (BURLETE PUERTA/S) |
| Servicio CARTER | 4 | tareas 139/213 |

## Resultados QA

16/16 PASS (incluyendo ticket sin ticket_tareas → 204 post-fix). QA Report: [VEC-3239](https://vecfleet-kanban.atlassian.net/browse/VEC-3239) — Finalizada ✅. VEC-2799 → Finalizada ✅.

→ Ver conocimiento del módulo en [[module-tickets]]
