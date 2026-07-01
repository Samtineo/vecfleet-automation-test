---
name: qa-exec-VEC-3400
description: "QA Exec para VEC-3400 — TKT de Llantas no permite ser presupuestado (error 500). Causa real: garantía con TypeError cuando movil = NULL. 3/3 PASS (CA1/CA2 empíricos, CA3 code-verified). Entorno vec-dev."
metadata:
  type: project
---

## Card

VEC-3400 — Tickets/Llantas | TKT de Llantas no permite ser presupuestado - No guarda movil_id

- **Bug reportado** (Coca-Cola FEMSA, reporter Hassan Salum): al presupuestar un ticket de LLANTAS, HTTP 500 (`errors.internal_server_error`) en `POST /api/ticket-presupuestos/ticket/{id}`. Bloqueaba presupuestar cualquier ticket de tipo llanta.
- **Hipótesis original (DESCARTADA):** falta `movil_id` en el ticket. En tickets de llanta el móvil = NULL es **intencional** (móvil / llanta / persona son entidades mutuamente excluyentes por diseño del tipo de ticket, ver `TicketsService.php:260-261`).
- **Causa raíz real (confirmada por Sofía Vigliaccio):** la lógica de GARANTÍA (`TicketsPresupuestosRepository::esGarantiaItem` / `esGarantiaTarea`) recibía `int $movilId` y explotaba con **TypeError** cuando el móvil era NULL. Solo se dispara con `tickets.periodoGarantia.habilitado = 'true'`. La garantía detecta re-trabajo (mismo móvil + `id_item`/`id_tarea` + servicio, en tickets CORRECTIVO+CERRADO dentro de `periodoDias`); el móvil es la clave de agrupación, por eso NULL rompía.
- **Decisión de negocio (Sofía):** Opción A (mínima) — si el ticket no tiene móvil, saltear la garantía y devolver `null`. Opción B (dar garantía real a llantas agrupando por llanta) quedó como consulta futura de producto (Pamela → Jacobo).
- **Fix code-verified** (commit `ee624aa5e`, ya en `develop` de vec-fleet-api).
- Status card: Deployed To Stage (= vec-dev). fixVersion 2.13.13. Assignee Sofía. QA (customfield_10033) = stineo.

## Resultado

**3/3 PASS** (CA1 y CA2 empíricos en vec-dev; CA3 code-verified). QA Report: VEC-3400 (lo crea El Inspector por separado).

## Entorno

- **vec-dev**. Base API: `https://vec-dev.vecfleet.io/ws/Public/index.php/api`
- Login: `POST /public/auth/login` con `usuario` / `clave` (usuario `stineo`). Token en `resp.token`. Header de autenticación: `Authorization-Token`.
- Datos usados: llanta 1 (montada en móvil 2), móvil 2, servicio 1049 (DEFAULT-CORRECTIVO).

## Prerrequisitos

1. **Config de garantía HABILITADA** (para que el fix se ejercite; con garantía OFF el bug nunca se dispara):
   - `tickets.periodoGarantia.habilitado = "true"`
   - `tickets.periodoGarantia.periodoDias = "30"`
   - Verificar con `GET /config-business`.
   - **NO togglear esta config.** Ya está en `true` en vec-dev. Es master-driven (`parametros_clientes`) y un toggle puede revertirse solo (ver Gotchas).
2. Existencia de al menos una llanta y un servicio de tipo correctivo:
   - Llantas: `GET /llantas`
   - Servicios: `GET /servicios/select`
3. `tickets.autoAprobacion.habilitado` está ON en vec-dev → los presupuestos de bajo monto se auto-aprueban (respuesta 202, no error). Ver Gotchas 202 vs 201.

## Endpoints usados

| Método | Endpoint | Para qué |
|---|---|---|
| POST | `/public/auth/login` | Autenticación (usuario/clave → `resp.token`) |
| GET | `/config-business` | Verificar `tickets.periodoGarantia.habilitado` y `periodoDias` |
| GET | `/llantas` | Obtener llanta de prueba |
| GET | `/servicios/select` | Obtener servicio correctivo |
| POST | `/tickets` | Crear ticket (llanta o móvil) |
| POST | `/ticket-presupuestos/ticket/{id}` | Presupuestar el ticket (corazón del fix) |

## Casos de prueba

| CA | Escenario | Resultado | Observación |
|---|---|---|---|
| 01 | **Corazón del fix.** Presupuestar ticket de LLANTA (móvil NULL) con garantía ON | ✅ PASS | Ticket LLANTA CORRECTIVO id **868** (llanta 1 en móvil 2, servicio 1049). `POST /ticket-presupuestos/ticket/868` con `manoDeObra 1000` / `repuestos 500` → **HTTP 202** (NO 500). Presupuesto id 623 persistió; ticket pasó a APROBADO por auto-aprobación. |
| 02 | **Regresión móvil.** Presupuestar ticket con MÓVIL sigue funcionando | ✅ PASS | Ticket MÓVIL CORRECTIVO id **869** (móvil 2, servicio 1049). `POST` presupuesto → **HTTP 202**, presup id 624, ticket APROBADO. El fix es puramente aditivo/null-safe: la query de garantía queda intacta cuando hay móvil. |
| 03 | **Baseline garantía OFF.** Con garantía deshabilitada, la llanta jamás entra a la lógica de garantía | ✅ PASS (code-verified) | `TicketsPresupuestosRepository` líneas 1084-1086 y 1146-1148: `esGarantia*` solo se invoca si `$periodoGarantiaHabilitado`. Con garantía OFF nunca se entra a la función → nada que romper. No se togglea la config global (ver Gotchas). |

### Cómo replicar CA1 (paso a paso)

```
# 1. Login → token
POST /public/auth/login  { "usuario":"stineo", "clave":"***" }   → resp.token

# 2. Verificar config
GET /config-business
  tickets.periodoGarantia.habilitado == "true"
  tickets.periodoGarantia.periodoDias == "30"

# 3. Crear ticket de LLANTA (SIN movil)
POST /tickets
  { "ticketTipo":"CORRECTIVO", "llanta":{"id":1}, "servicio":{"id":1049} }
  → ticket id (ej. 868), movil_id = NULL

# 4. Presupuestar (corazón del fix)
POST /ticket-presupuestos/ticket/868
  { "manoDeObra": 1000, "repuestos": 500 }
  → HTTP 202  (antes del fix: HTTP 500 errors.internal_server_error)
  → presupuesto persiste, ticket → APROBADO (auto-aprobación por monto)
```

### Cómo replicar CA2 (regresión móvil)

```
POST /tickets
  { "ticketTipo":"CORRECTIVO", "movil":{"id":2}, "servicio":{"id":1049} }
  → ticket id (ej. 869)
POST /ticket-presupuestos/ticket/869  { "manoDeObra":1000, "repuestos":500 }
  → HTTP 202, presupuesto persiste, ticket → APROBADO
```

## Fix (verificado en código, vec-fleet-api)

- `esGarantiaItem` y `esGarantiaTarea` pasaron de `int $movilId` a `?int $movilId`.
- Guard nuevo al inicio de ambas funciones:
  ```php
  // Tickets de llanta/persona no tienen móvil asociado (movil = NULL por diseño):
  // la garantía se evalúa por re-trabajo sobre el mismo móvil, así que sin móvil no aplica. VEC-3400.
  if (!$movilId || !$idItem || !$servicioId) {
      return null;
  }
  ```
- **Doble red de seguridad** (config gate): en `TicketsPresupuestosRepository` líneas 1084-1086 (items) y 1146-1148 (tareas), `esGarantia*` solo se llama si `$periodoGarantiaHabilitado === true`. Con garantía OFF nunca se entra a la función.
- Se agregó `GarantiaPresupuestoDetalladoTest.php`.
- Commit `ee624aa5e`, ya en `develop`.

## Gotchas

- **Garantía debe estar ON para reproducir el bug.** Con `tickets.periodoGarantia.habilitado = "false"`, el flujo nunca invoca `esGarantia*` (gate de config), por lo que el TypeError original nunca se dispara y la llanta se presupuesta sin problema. En vec-dev la config ya está en `"true"`, que es el escenario que ejercita el fix. Si al replicar la config aparece en `"false"`, el CA1 "pasaría" trivialmente sin probar nada — verificar primero.
- **NO togglear `tickets.periodoGarantia.habilitado`.** Es master-driven (`parametros_clientes`); un cambio manual en `config_business` puede revertirse solo en el próximo sync. Dejarla como está (`true`) y ajustar el CA a la config vigente.
- **Móvil NULL en tickets de llanta es intencional, NO un bug.** móvil / llanta / persona son mutuamente excluyentes (`TicketsController::validate` línea 1655). La hipótesis "no guarda movil_id" del título de la card es un falso diagnóstico; el título quedó heredado del reporte original.
- **Crear ticket de llanta:** `POST /tickets` con body `{"ticketTipo":"CORRECTIVO","llanta":{"id":N},"servicio":{"id":M}}` **SIN** el campo `movil`. `getInstanceFromRequest` (1509-1525): `setMovil` solo si viene el param `movil`; `setLlanta` solo si viene `llanta`. Mandar ambos falla la validación de exclusión mutua.
- **Body de presupuesto:** requiere `manoDeObra` (number) y `repuestos` (number). `presupuestoItems` / `presupuestoTareas` son opcionales (`TicketPresupuestosValidation::create`).
- **202 vs 201 — ambos son éxito.** `202` = presupuesto auto-aprobado por monto (`tickets.autoAprobacion.habilitado` ON, caso de vec-dev). `201` = creado sin auto-aprobar. Ninguno es error; el bug se manifestaba como `500`.
- **CA2 no monta el E2E de re-trabajo cerrado.** La garantía real (detección de re-trabajo con ticket histórico CORRECTIVO+CERRADO) no se montó E2E; se verificó que el fix es aditivo/null-safe por código + smoke con móvil. La garantía sigue funcionando cuando hay móvil (query intacta). Si se quiere garantía real de llantas, es Opción B (producto, no implementada).

## QA Report

VEC-3400 — https://vecfleet-kanban.atlassian.net/browse/VEC-3400
