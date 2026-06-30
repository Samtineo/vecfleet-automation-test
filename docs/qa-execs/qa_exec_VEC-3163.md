---
name: qa-exec-vec-3163
description: "Ejecución QA de VEC-3163: Editar presupuestos en tickets cerrados — endpoints, permisos, config y gotchas de entorno"
metadata:
  node_type: memory
  type: project
  originSessionId: current
---

## Feature

Editar el último presupuesto e modificar adjuntos de tickets en estado CERRADO, habilitado por permisos específicos.

**Card:** VEC-3163  
**Entorno:** vec-hotfix (`https://vec-hotfix.vecfleet.io/ws/Public/index.php/api`)  
**Estado:** 4/4 PASS (CA1 y CA3 vía API; CA2 y CA4 validados manualmente por QA)

## Endpoints correctos

| Operación | Endpoint | Permiso requerido |
|---|---|---|
| Editar presupuesto en histórico | `POST /ticket-presupuestos/ticket/{ticketId}` | `EDITAR_PRESUPUESTOS_TICKETS_CERRADOS` |
| Modificar adjuntos del ticket | `PUT /tickets/adjuntos/{ticketId}` | `TICKETS_MODIFICAR_ADJUNTOS_CERRADOS` |

> ⚠️ `POST /tickets/listo-para-retirar/{id}` NO es el endpoint de edición de presupuesto — registra costos reales y transiciona a REALIZADO.

## Prerrequisitos

1. **Config activa:** `tickets.presupEditCerrado.habilitado = true` — sin esto, `EDITAR_PRESUPUESTOS_TICKETS_CERRADOS` es filtrado de `GET /permisos`
2. **Permisos en perfil:** `EDITAR_PRESUPUESTOS_TICKETS_CERRADOS` y `TICKETS_MODIFICAR_ADJUNTOS_CERRADOS`
3. **Ticket CERRADO** con al menos un presupuesto en el histórico

## Casos de prueba

| CA | Escenario | Resultado |
|---|---|---|
| CA1 | Editar presupuesto CON permiso → ticket CERRADO | ✅ HTTP 201 |
| CA2 | Editar presupuesto SIN permiso → ticket CERRADO | ✅ HTTP 403/409 (validado manual) |
| CA3 | Modificar adjunto CON permiso → ticket CERRADO | ✅ HTTP 204 |
| CA4 | Modificar adjunto SIN permiso → ticket CERRADO | ✅ HTTP 403/409 (validado manual) |

## Datos de vec-hotfix usados

| Entidad | ID | Notas |
|---|---|---|
| Ticket de prueba | 6 | Estado CERRADO, tipo CORRECTIVO |
| Presupuesto editado | 7 | Último presupuesto del ticket 6 |

## Gotcha crítico — entorno vec-hotfix

`EDITAR_PRESUPUESTOS_TICKETS_CERRADOS` y `TICKETS_MODIFICAR_ADJUNTOS_CERRADOS` **no aparecen en `GET /permisos`** en vec-hotfix aunque el código los defina en `Permisos.php`. Causa: deployment parcial — el código PHP del fix no estaba completamente desplegado al momento del QA.

Consecuencia: no fue posible asignar/quitar estos permisos vía API (`PUT /perfiles/{id}` rechaza con `no_existe_el_permiso`). CA2 y CA4 fueron validados manualmente por QA desde la UI.

**Para regresión futura:** verificar primero que ambos permisos aparezcan en `GET /permisos` antes de intentar automatizar CA2/CA4.
