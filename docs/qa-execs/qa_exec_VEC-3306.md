---
name: qa-exec-VEC-3306
description: "QA exec VEC-3306: bug facturación región (móvil.base actual vs tic.base snapshot). Fix en 2 queries (exportTickets + getAllByFacturaId). Verificado por código."
metadata:
  node_type: memory
  type: project
  originSessionId: current
---

# VEC-3306 — Facturas: región del ticket (snapshot vs base actual del móvil)

**Bug (Error, reportado por Telecom):** en prefacturación, los tickets aparecían bajo la **región/base ACTUAL del móvil** en vez de la **base que tenía el móvil al gestionar el ticket** (snapshot). Causa: queries de lectura hacían `JOIN bases ON moviles.base` en vez de `ON tickets.base` (snapshot). Es bug de lectura; `tickets.base` guarda bien el snapshot.

## Fix (verificado en código)
| Query | Archivo:línea | Estado |
|---|---|---|
| `exportTickets()` (prefacturación por gerenciador) | `FacturasRepository.php:868, 982` | ✅ `t.base = bas.id` |
| `getAllByFacturaId()` (detalle de tickets de una factura, vía `TicketsController:532`) | `TicketsRepository.php:2374` | ✅ `tic.base = bas.id` (era `mov.base` — corregido por Iván 2026-06-30 tras flag de QA) |

**Historia:** el primer deploy corrigió solo `exportTickets`; QA detectó (2026-06-29) que `getAllByFacturaId` L2374 seguía con `mov.base` (mismo síntoma en el detalle de factura). Se reportó a Iván → corregido y redeployado 2026-06-30.

**Otras queries del módulo verificadas OK** (ya usaban `tic.base`/`t.base`): `TicketsRepository` L1013/1065/2298, `OTRepository` L757, `TablaRepository` L246/295.

## Veredicto
**Verificado por código** (decisión del usuario: opción B). Ambas queries ahora usan el snapshot `tic.base`. El E2E empírico (transferir un móvil de base post-cierre y verificar que el filtro de prefacturación + el detalle muestran la región original) NO se ejecutó — requería `PUT /moviles/{id}` para transferir base; riesgo bajo porque es el mismo one-liner ya aplicado y verificado en las 2 queries, y el resto del módulo quedó chequeado.

**Pendiente menor (Producto):** la card menciona que Producto debía definir si el comportamiento snapshot es el deseado (label `Attention_PO`). El fix asume que sí.

## QA Report
VEC-YYYY (Tarea, label test). Card VEC-3306 → Finalizada. Ver [[module-facturacion]].
