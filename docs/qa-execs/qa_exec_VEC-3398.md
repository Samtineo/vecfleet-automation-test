---
name: qa-exec-VEC-3398
description: "QA Exec para VEC-3398 — Tickets: Inconsistencia con ADIC PRESUPUESTADO (dos bugs independientes). Entorno teco-test (workflow real Telecom)."
metadata:
  node_type: memory
  type: project
  originSessionId: 343d89fe-1597-48de-93e2-54bf06a0eb1b
---

## Entorno
- URL base: **teco-test = `personal-test.vecfleet.io`** (`-test` = NO producción; el `appEnv:production` que aparece es solo el modo de Laravel, no el tenant productivo).
- **Por qué teco-test y no vec-dev:** S1 NO se reproduce en vec-dev porque su `ticket_workflow` difiere del de Telecom. vec-dev tiene la transición APROBADO→PRESUPUESTAR; Telecom NO la tiene (desde APROBADO/EN_REPARACION solo admite `PRESUPUESTAR_ADIC`). Para reproducir el 403 hay que usar el workflow/config real de Telecom.
- Usuario: stineo. Token: `POST /public/auth/login` con `usuario`/`clave`. Header de auth `Authorization-Token: {token}` (NO `Bearer`). Verificar el shape del response del login para saber si el token viene en `resp.token` (top-level) o en `resp.usuario.token`.
- **Config teco-test:**
  - `tickets.presupuesto.borrador.habilitado = OFF`
  - `tickets.presupuesto.aprobacionAuditor.habilitado = ON`
  - `tickets.presupuesto.autoAprobacion.habilitado = ON`, monto = 400000
  - Regla de auto-aprobación: presupuesto ≤ 400.000 → auto-aprueba (queda **Auto-Aprobado**); presupuesto > 400.000 → queda **Pendiente-Auditor**. Para llegar a ADIC_PRESUPUESTADO en la UI conviene un monto > 400.000 (así no se auto-aprueba y se ve la transición).

## Contexto del bug
Bug reportado por Soporte (Hassan / EFFEM-Telecom), dev Sofi Vigliaccio, QA stineo. Versión v2.13.12. Son **dos bugs independientes** que se manifestaban juntos en el flujo de presupuesto adicional:

- **S1 — 403 / el ticket no transiciona a ADIC_PRESUPUESTADO.** Regresión de VEC-3231. Con `borrador.habilitado=OFF`, el front mandaba `adicional=false`. El backend derivaba `nextState='PRESUPUESTAR'`, transición inexistente desde APROBADO/EN_REPARACION (esos estados solo admiten `PRESUPUESTAR_ADIC`). Resultado: HTTP 403 "Contacte al administrador" y el ticket quedaba atascado en EN_REPARACION.
  - **Fix (FRONT, `TicketPresupuestoDetallado.js`):** restaura el fallback `canDo('PRESUPUESTAR_ADIC')` cuando el flag de borrador está OFF, de modo que el front envíe `adicional=true` y el backend resuelva `PRESUPUESTAR_ADIC`.

- **S2 — precarga de ítems de un presupuesto ya aprobado.** Con `aprobacionAuditor.habilitado=ON`, el presupuesto nace **Pendiente-Auditor** y, al auto-aprobarse, termina **Auto-Aprobado**. El método `TicketsPresupuestosRepository::sumarizarTotalesAprobados` no incluía el estado `'Auto-Aprobado'` en su query → `presupuesto_nombre` quedaba vacío → el front lo interpretaba como "el ticket no tiene presupuesto" y precargaba los ítems del aprobado vía `/items-activos`.
  - **Fix (BACKEND, `TicketsPresupuestosRepository.php` ~líneas 480 y 491-493):** incluir `'Auto-Aprobado'` en la query de sumarización, así `presupuesto_nombre` se puebla. **+ FRONT:** no precargar ítems si `/items-activos` indica estado Aprobado/Auto-Aprobado.
  - Test del dev: `SumarizarTotalesAutoAprobadoTest`.

## Prerrequisitos
1. Acceso a **teco-test (`personal-test.vecfleet.io`)** con el workflow y config real de Telecom (ver Config en Entorno).
2. Confirmar con dev (Sofi Vigliaccio) que los fixes (front S1 + front/backend S2) están desplegados en teco-test.
3. **Ticket de prueba NUEVO** (regla Pamela: en teco usar siempre un ticket nuevo, no tocar tickets abiertos de otros). En esta sesión se usó el **488820** (CORRECTIVO, móvil 47192).
4. **El ticket debe tener `gerenciador` asignado** para que la UI muestre el botón de carga de adicional (ver Gotchas). Asignar por `PATCH /tickets/{id}` con `gerenciador:{id, razonSocial}` (ambos campos obligatorios en el validador).
5. Para ver ADIC_PRESUPUESTADO en UI: cargar un presupuesto inicial, llevarlo a APROBADO/Auto-Aprobado, y luego cargar el adicional con monto > 400.000 (para que NO se auto-apruebe y se vea la transición).

## Endpoints usados
| Método | Endpoint | Para qué |
|---|---|---|
| POST | `/public/auth/login` | Autenticación. Header `Authorization-Token` (no Bearer) |
| GET | `/tickets/{id}` | Detalle del ticket |
| GET | `/tickets/{id}/actions` | Acciones disponibles para el ticket (saber si admite PRESUPUESTAR_ADIC) |
| PATCH | `/tickets/{id}` | Asignar `gerenciador` (id + razonSocial obligatorios) |
| POST | `/ticket-presupuestos/ticket/{ticketId}` | Crear/editar presupuesto. Campo `adicional` true/false define el nextState |
| GET | `/ticket-presupuestos/ticket/{ticketId}/items-activos` | Ítems del presupuesto activo; el estado (Aprobado/Auto-Aprobado) define si el front precarga |

## Casos de prueba (teco-test, ticket 488820)

| CA | Tipo | Escenario | Resultado | Observación |
|---|---|---|---|---|
| CA1b | API | `adicional=false` desde APROBADO → backend resuelve `PRESUPUESTAR` (inválido) | ✅ PASS | HTTP 403 "Contacte al administrador", rollback (no muta el ticket) |
| CA1 | API | `adicional=true` desde APROBADO → `PRESUPUESTAR_ADIC` | ✅ PASS | HTTP 202, transición válida |
| CA7 | API + código + test | Presupuesto Auto-Aprobado → `presupuesto_nombre` se puebla (no queda vacío) | ✅ PASS | Verificado live en 488820 + test `SumarizarTotalesAutoAprobadoTest` |
| CA4 | código | Recotización → `nextState='PRESUPUESTAR'` (convivencia con VEC-3350) | ✅ PASS | `esRecotizacion` mantiene PRESUPUESTAR; no entra en conflicto con el fix S1 |
| CA2 | UI | Adicional desde EN_REPARACION → ADIC_PRESUPUESTADO sin 403 | ✅ PASS | Con borrador OFF, el front ya manda `adicional=true` |
| CA6 | UI | No precarga ítems del presupuesto aprobado | ✅ PASS | `presupuesto_nombre` poblado → front no trata el ticket como "sin presupuesto" |
| CA8 | UI | Recotización total no precarga; recotización parcial muestra ítems a recotizar y permite agregar | ✅ PASS | Comportamiento correcto en ambos modos |

**7/7 PASS.**

## Gotchas
1. **vec-dev NO reproduce S1.** Su `ticket_workflow` tiene APROBADO→PRESUPUESTAR, que Telecom no tiene. El 403 solo sale con el workflow real de Telecom (teco-test). Si alguien intenta reproducir en vec-dev y "no falla", es por el workflow distinto, no porque el bug no exista.
2. **Adicional se carga con la acción `PRESUPUESTAR_ADIC`** (botón "Cargar Presupuesto Adicional" en la sección Presupuesto), disponible desde EN_REPARACION/APROBADO. **NO** confundir con `SOLICITAR_ADICIONAL`, que solo está disponible desde ADIC_PRESUPUESTADO. Son acciones distintas.
3. **El botón de carga de adicional exige `ticket.gerenciador`** (validado en `TicketPresupuestos.js` líneas ~361/401/442). Un ticket creado por API sin gerenciador NO muestra el botón en la UI. Asignarlo con `PATCH /tickets/{id}` enviando `gerenciador:{id, razonSocial}` — **ambos** campos son obligatorios en el validador, falta de uno hace fallar el PATCH.
4. **Auto-aprobación por monto:** con `autoAprobacion=ON` y monto=400000, presupuestos ≤ 400k se auto-aprueban (→ Auto-Aprobado) y no llegan a Pendiente-Auditor. Para ver el estado Pendiente-Auditor o la transición ADIC_PRESUPUESTADO en UI, usar monto > 400k.
5. **`presupuesto_nombre` es la señal de "el ticket ya tiene presupuesto".** Si la query de sumarización omite un estado válido (como pasó con Auto-Aprobado), `presupuesto_nombre` queda vacío y el front precarga ítems indebidamente. Ante una precarga inesperada de ítems, revisar qué estados incluye `sumarizarTotalesAprobados`.
6. **Endpoint para inspeccionar acciones:** `GET /tickets/{id}/actions` lista las transiciones disponibles. Útil para confirmar si un estado admite `PRESUPUESTAR_ADIC` antes de cargar.
7. **Limpieza vec-dev (housekeeping de esta sesión):** quedó un presupuesto huérfano (id 515) al sondear el ticket 762 en vec-dev antes de mover el QA a teco-test. Limpiar en DBeaver: ``UPDATE `vec-dev`.ticket_presupuestos SET estado='Rechazado', activo=0 WHERE id=515;``

## QA Report
VEC-3398 — comentario en la card (id 140875) — https://vecfleet-kanban.atlassian.net/browse/VEC-3398
