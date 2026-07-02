---
name: qa-exec-vec-3397
description: "QA Exec para VEC-3397 — Preventivos no se generan para móviles inactivos. Bugfix. Entorno vec-hotfix. QA Report VEC-3452. PASS."
metadata:
  type: project
---

# VEC-3397 — Preventivos no se generan para móviles inactivos

Bug (Personal/Teco prod). Dev: Ivan Velazquez. Fix PR #2136. **Entorno de validación: vec-hotfix** (donde está desplegado). QA Report VEC-3452. Resultado PASS.

## Fix
`->where('moviles.activo', 1)` agregado a las queries de generación de preventivos en `PreventivosRepository.php`: `generateTicketsFromPreventivosSinPlan` (km-based, ~L494) y `generarTicketsPorIntervaloTemporalSinPlan` (temporal, ~L803). Antes el cron generaba tickets para móviles inactivos.

## Receta de ejecución (vec-hotfix)
1. Login stineo/susy1234. Servicio 37 (--SERVICIO DEFAULT--, PREVENTIVO, km-based, alertarPrevios=250).
2. Elegir un móvil LIMPIO (sin controles preventivos activos, si no la inactivación da 400 "este movil tiene Tickets Preventivos activos"). En hotfix se usó móvil 16 (AA008FG).
3. INACTIVAR: `PUT /api/moviles/{id}/estado` {estado:"FUERA DE SERVICIO", activo:false, motivo}. (Orden importa: inactivar ANTES de tener tickets/controles.)
4. Crear control due: `POST /api/preventivos` {servicio_id:37, movil:{id,kmActual}, realizarALos:1, activo:true, comentario}. GOTCHA: `movil` debe ser objeto {id,kmActual}; `activo` debe ser boolean `true` (con `1` no persiste, queda null).
5. Cron: `POST /api/crons/generacion-tickets-preventivos`.
6. Verificar: `GET /api/tickets/moviles/{id}/grid` contar PREVENTIVO.

## CAs (PASS)
| Escenario (mismo control, servicio 37, móvil 16) | Resultado |
|----|-----------|
| Móvil INACTIVO (activo=false) → cron | ✅ 0 preventivos generados (fix) |
| Móvil ACTIVO (OPERATIVO) → cron | ✅ 1 preventivo generado (contraste) |

## Notas
- Vencimientos: ya filtraba móviles inactivos de antes (`mov.activo=1 AND mov.estado IN (estadosActivos)` en VencimientosRepository) → code-verified, fix correctamente Preventivos-only.
- develop NO tiene el fix aún (confirmado con `git merge-base --is-ancestor cff19e729 develop` → NO); en vec-dev el bug reproduce. Es esperado: hotfix primero, merge a develop tras aprobación.
- Gotcha reusable: el guard `movilRepository.errors.este_movil_tiene_Tickets_Preventivos_activos` bloquea cambiar estado de un móvil con controles preventivos activos → para inactivar, usar móvil sin controles activos y crear el control después.

## Datos de prueba dejados
vec-hotfix: móvil 16 (control 9 + ticket generado, reactivado), móvil 9 (control 8 + ticket 91). vec-dev: móvil 62 (quedó inactivo + ticket 878), móvil 61 (controles 187/188 + ticket). Pendiente limpieza.

## QA Report
VEC-3452 — https://vecfleet-kanban.atlassian.net/browse/VEC-3452
