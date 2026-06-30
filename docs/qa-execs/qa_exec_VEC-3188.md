---
name: qa-exec-vec-3188
description: "Ejecución QA de VEC-3188: Bypass de estado para reasignación de tickets cerrados — AND gate de permisos, endpoints, datos y gotchas"
metadata:
  node_type: memory
  type: project
  originSessionId: current
---

## Feature

Extender el bypass de `ValidarEstadoTicketMiddleware` al endpoint `PATCH /tickets/asignacion/{id}` para tickets en estado CERRADO.

**Card:** VEC-3188
**Entorno:** vec-hotfix (`https://vec-hotfix.vecfleet.io/ws/Public/index.php/api`)
**Estado:** 6/6 PASS (CA1, CA2, CA4 y regresión VEC-3163 vía API; CA3 y CA-R1 validados manualmente)

## Endpoints afectados

| Endpoint | Bypass activado desde |
|---|---|
| `PATCH /tickets/asignacion/{id}` | VEC-3188 (nuevo) |
| `POST /ticket-presupuestos/ticket/{id}` | VEC-3163 → actualizado en VEC-3188 |

## Lógica del bypass (AND gate)

El bypass requiere que el usuario tenga **AMBOS** permisos simultáneamente:

```
bypassActivo = EDITAR_PRESUPUESTOS_TICKETS_CERRADOS AND TICKETS_MODIFICAR_ADJUNTOS_CERRADOS
```

- Un solo permiso **no alcanza** — devuelve 409 igual que sin permisos
- `CANCELADO` sigue bloqueado sin excepciones en ambos endpoints
- La validación de acceso por CC se aplica normalmente (no es afectada por el bypass)

> ⚠️ **Breaking change vs VEC-3163:** `POST /ticket-presupuestos/ticket/{id}` pasó de requerir un solo permiso a requerir ambos.

## Casos de prueba

| CA | Escenario | Resultado |
|---|---|---|
| CA1 | CON ambos permisos → reasigna ticket CERRADO | ✅ HTTP 204 |
| CA2 | SIN permisos → reasigna ticket CERRADO | ✅ HTTP 409 |
| CA3 | CON bypass pero SIN acceso al CC | ✅ Rechazado por CC (manual) |
| CA4 | CON bypass, ticket NO CERRADO (regresión) | ✅ HTTP 204 |
| CA-R1 | CON solo UN permiso → reasigna ticket CERRADO (AND gate) | ✅ HTTP 409 (manual) |
| Reg. VEC-3163 | CON ambos permisos → edita presupuesto ticket CERRADO | ✅ HTTP 201 |

## Datos de vec-hotfix usados

| Entidad | ID | Notas |
|---|---|---|
| Ticket CERRADO | 6 | Tipo CORRECTIVO |
| Ticket ABIERTO | 2 | Usado para CA4 |

## Gotcha — permisos en vec-hotfix

`EDITAR_PRESUPUESTOS_TICKETS_CERRADOS` y `TICKETS_MODIFICAR_ADJUNTOS_CERRADOS` **no aparecen en `GET /permisos`** aunque la config `tickets.presupEditCerrado.habilitado = true` esté activa. Causa: mismo deployment parcial de vec-hotfix que en VEC-3163.

Para asignar/quitar los permisos en este entorno hay que hacerlo **manualmente desde la UI** — `PUT /perfiles/{id}` rechaza IDs que no estén en `GET /permisos`.
