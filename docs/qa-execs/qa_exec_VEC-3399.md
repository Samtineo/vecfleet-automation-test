---
name: qa-exec-vec-3399
description: "QA Exec para VEC-3399: tickets predictivos no se crean en clientes sin ROP habilitado. Entorno vec-dev."
metadata: 
  node_type: memory
  type: project
  originSessionId: 343d89fe-1597-48de-93e2-54bf06a0eb1b
---

## Resumen

Card VEC-3399 "Tickets predictivos no se crean en clientes sin ROP habilitado". Entorno vec-dev. QA: stineo. Dev: Matias Sosa. PR #2108 (merged).

**Causa raíz REAL (confirmada en el diff del PR, 1 línea):** en `vec-fleet-api/Service/PredictivoEvaluacionService.php`, método `dispararCreacionTicketPredictivo` (el path SIN ROP), el bloque de cálculo de centro de costos llamaba `(new MovilRepository())->get($movil)` pasando la variable equivocada en vez de `$movilId`. Esa línea corre SIEMPRE en el path sin-ROP, por lo que lanzaba una excepción que el catch del motor capturaba en silencio, y NUNCA se creaba ticket para clientes sin ROP. Fix: pasar `$movilId`.

> Nota de proceso: durante el análisis El Alquimista teorizó que la causa era `km_actual ?: 0`. Esa teoría fue INCORRECTA. El diff mostró que el bug real es la variable equivocada en la llamada a `MovilRepository::get`. Se registra la causa REAL, no la teoría.

## Entorno

- URL base: vec-dev (`https://...-dev.vecfleet.io`)
- Tenant vec-dev: **ROP OFF**. Con ROP off el motor crea tickets de tipo **PREDICTIVO** (path `dispararCreacionTicketPredictivo`). Con ROP on crearía CORRECTIVO con detalle PREDICTIVO (path `dispararCreacionCorrectivoRopPredictivo`, no tocado por este fix).
- Auth: `POST /public/auth/login`, usuario `stineo`, token en `resp.usuario.token`.

## Prerrequisitos

- Config `predictivo.habilitado = true` en config_business (vía DBeaver).
- Tenant con ROP OFF (estado default de vec-dev) para ejercitar el path corregido.
- Móvil de prueba: **móvil 2** sin ticket predictivo abierto para el servicio elegido.
- Servicio PREDICTIVO: **1072** (DEFAULT - PREDICTIVO).
- 3 registros consecutivos positivos en `predictivos_historico` para móvil 2 + servicio 1072 (insertar vía `POST /api/predictivo-historicos`, fechas consecutivas).

## Endpoints usados

| Método | Endpoint | Para qué |
|---|---|---|
| POST | `/public/auth/login` | Obtener token (`resp.usuario.token`) |
| POST | `/api/predictivo-historicos` | Insertar predicción diaria (`service_id` entero) |
| POST | `/api/crons/evaluacion-predictivos` | Disparar el motor de reglas |
| GET | `/tickets/newGrid` | Verificar persistencia del ticket creado (grilla productiva en vec-dev) |

## Casos de prueba

| CA | Escenario | Resultado | Observación |
|---|---|---|---|
| CA1 | Fix: tenant ROP off + 3 positivos consecutivos (móvil 2, servicio 1072), disparar motor | ✅ | Creó **ticket 771** (PREDICTIVO, ABIERTO, `centro_costos` poblado). `candidatosDisparados=1`, `ticketsCreados=1` |
| CA2 | km presente en los tickets generados | ✅ | Tickets 769/770/771 con km correcto |
| CA3 | Regresión ROP on (path con ROP) | N/A | El diff no toca `dispararCreacionCorrectivoRopPredictivo`. Riesgo nulo por construcción. No ejecutable sin togglear config ROP (requiere DB) |
| CA4 | R2 no duplica: re-disparar el motor | ✅ | `candidatosDisparados=0`, `ticketsCreados=0` |
| CA5 | Sin error silencioso | ✅ | `candidatosDisparados == ticketsCreados` en ambas corridas |
| CA6 | Motor intacto: reglas R1/R2 | ✅ | OK |
| OBS | INC-007 candidata (Alquimista): toggle ROP con ticket abierto, posible doble disparo | 📋 OBS | NO testeada (requiere DB para togglear `rop.habilitado`). Edge ajeno a este fix. Queda como pendiente exploratorio, NO confirmada |

Resultado global: 5/5 PASS (CA3 N/A por construcción).

## Gotchas

- **Tenant vec-dev = ROP OFF.** El motor crea tickets tipo PREDICTIVO vía `dispararCreacionTicketPredictivo`. Con ROP on el comportamiento cambia: crea CORRECTIVO con detalle PREDICTIVO (otro path). Si en una regresión futura aparece un CORRECTIVO en vez de PREDICTIVO, revisar el estado de `rop.habilitado` del tenant.
- **Verificación SIEMPRE por persistencia, nunca por el 200 del cron.** El motor responde 200 incluso si la creación interna falla (el error silencioso de fondo sigue como deuda técnica). Validar en la grilla `/tickets/newGrid`: paginado 0-indexed, el sort no funciona, ir a la última página vía `pagination.count` para ver el ticket recién creado.
- **El bug era invisible por el catch del motor.** Una excepción en el path sin-ROP se capturaba en silencio: el cliente sin ROP simplemente no veía tickets, sin error. Por eso el contrato de verificación es `candidatosDisparados == ticketsCreados`, no el HTTP 200.
- **Servicios PREDICTIVO vigentes en vec-dev hoy:** 1062 (PREDICTIVO TEST), 1072 (DEFAULT - PREDICTIVO). El 1053 ya NO aparece en el select (estaba documentado en qa_exec_predictivos_alta_tickets pero quedó obsoleto).
- **Datos de prueba dejados a propósito en vec-dev** (reutilizables, no recrear): tickets 769/770/771, registros `predictivos_historico` para móvil 2 / servicio 1072 fechas 2026-06-23/24/25.

## QA Report

VEC-3399, https://vecfleet-kanban.atlassian.net/browse/VEC-3399 (publicado como comentario en la card)
