# VEC-3370 — Bloqueo preventivo por alcance de % de presupuesto

**Feature:** continuación de VEC-3266 (submódulo Reglas) y VEC-3369 (notif por umbral). Esta story implementa SOLO la acción de **bloqueo** al aprobar un ticket cuando el consumo del período alcanza/supera el % de una regla activa con `accion_bloqueo=true`.

**Entorno:** vec.vecfleet.io (test). Config 86 "TEST GeVilla", período 1455. Regla de bloqueo id=2 al 90%. Bases: 1161 (~100%, tope) y 1175 (~50%, móvil 30075 dominio 102qpa). Auth: `POST /public/auth/login` {usuario:stineo, clave:susy1234}, header `Authorization-Token`, token en `resp.token`.

**Estado:** QA en scope PASS (6/6). Madre On Hold esperando definición de dev/PO sobre 3 OBS. QA Report VEC-3446 (Done).

## Código (autoritativo)
- `TicketsService::validarReglasDeBloqueo(int $id)` (Service/TicketsService.php:1855-1943), llamado en `POST /tickets/aprobar/{id}` (Controller/TicketsController.php:762) ANTES de `validarAntesDeAprobar`.
- Cálculo: `porcentajeResultante = (comprometido + consumido + totalPresupuestoTicket) / montoAplicable * 100`; si `>= regla.porcentaje_umbral` (inclusivo) → `BadRequestException` HTTP 400.
- `montoAplicable`/`comprometido`/`consumido` a nivel Base (`tickets.base`, filtra `ticket_presupuestos.estado='Aprobado'`).
- Gate: retorna temprano si `periodoPresupuestario.habilitado != 'true'` (L1857).
- Constraint: `PeriodoReglaService::validarUnicaReglaBloqueoActiva` — una sola regla de bloqueo activa por `periodos_config_id`.

## Receta de ejecución (API)
1. Crear regla de bloqueo: `POST /periodo-reglas` {periodos_config_id:86, nombre, porcentaje_umbral:90, accion_notificacion:false, accion_bloqueo:true, activa:true}.
2. Crear ticket correctivo (payload mínimo movil+servicio 188+tarea 265) → `POST /tickets`.
3. Presupuesto: `POST /ticket-presupuestos/ticket/{id}` {manoDeObra:X, resto 0, presupuestoItems:[], presupuestoTareas:[]}.
4. Aprobar: `POST /tickets/aprobar/{id}` {} → 204 aprueba / 400 bloqueado.

## Casos de aceptación
| CA | Escenario | Ejecución | Resultado |
|----|-----------|-----------|-----------|
| CA1 | CU-04/S02: base ya ≥ umbral | aprobar en 1161 | 400 "…alcanzaría el 90%…", ticket sin aprobar — PASS |
| CA2 | S01: ticket cruza umbral | MO=500 en 1175 | 400 bloqueado — PASS |
| CA3 | S03: ticket bajo umbral | MO=100 en 1175 | 204 aprueba — PASS |
| CA4 | S04: sin regla de bloqueo activa | desactivar id=2, aprobar 95% bajo presupuesto en 1175 | 204 aprueba, luego reactivé id=2 — PASS |
| CA5 | Constraint 1 regla | crear 2ª regla de bloqueo activa | 400 `periodoRegla.errors.ya_existe_regla_bloqueo_activa` — PASS (confirmado por Producto en la card) |
| CA6 | S05/gate | `periodoPresupuestario.habilitado` gate + regla notif-only no bloquea | code-verified (L1857) — PASS |

**Regresión VEC-3369:** al aprobar bajo el 90% pero sobre el 40%, la notif del umbral siguió disparando (count subió). Bloqueo y notif conviven en `aprobar()`. PASS.

## Gotcha
El bloqueo por **saldo insuficiente** ("No se puede aprobar el ticket porque supera el monto presupuestado en el periodo") es una validación PRE-existente y DISTINTA, scope-out en la card. Base 1161 al 100% dispara ESTE bloqueo (no el de umbral) al desactivar la regla. Para CA4 limpio usar base con margen (1175).

## OBS abiertas (On Hold)
- OBS-1: bloqueo acoplado a `aprobar()`; auto-aprobación (`aprobarPresupuesto`) lo saltea. Mismo hueco que VEC-3369. No disparable en vec.vecfleet.io (autoAprobacion=0).
- OBS-2 (INC-007 candidata): `trabajaConEstadosPresupuesto.habilitado=false` → acumulado ~0 → umbral nunca alcanzado → falso PASS silencioso.
- OBS-3 (doc): constraint "una sola regla de bloqueo activa" contradice VEC-3266 CA16 ("duplicados permitidos"). El constraint es lo esperado por Producto → actualizar doc.
