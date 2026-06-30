---
name: qa-exec-vec-3200
description: "QA VEC-3200 — Impresión presupuesto ITEMS vs MO. 6/6 PASS. Fix aplicado por Ivan Velazquez. QA Report: VEC-3256"
metadata:
  node_type: memory
  type: project
  originSessionId: fddf5493-1cbd-4827-9450-1f1d7cb5ca38
---

## Card
[VEC-3200](https://vecfleet-kanban.atlassian.net/browse/VEC-3200) — Historia · Assigned: Ivan Velazquez · QA: stineo · Estado: **Finalizada**

## Estado del deploy
- **Fix en develop:** SÍ — PR #2019 (`revert/VEC-3200`) mergeado a develop 2026-05-26
- **Entorno de prueba:** vec-dev

## Qué se corrigió
**API — `TicketsController.php` (`print-data-pdf`):**
- JOIN `presupuesto_items` ← `items` para obtener `tipo`
- Separa `repuestos` (tipo ≠ MANO_DE_OBRA) y `manoDeObraItems` (tipo = MANO_DE_OBRA)

**Frontend — `TicketDatosGenerales.js:815`:**
- Lee `manoDeObraItems` del response → los pone en sección MO del print
- Sección Repuestos solo muestra ítems no-MO

## Resultado QA — 2026-05-30

### Escenario `trabajaConManoDeObra = true` → ✅ 5/5 PASS
Ticket de prueba: **#576** (HWX6787), presupuesto ID 359
- Repuesto Default (ID 31, $1000) + Mano de Obra Default (ID 32, $1000)

| CA | Resultado |
|---|---|
| CA1 Vista operativa | ✅ PASS |
| CA2/CA3 Print ABIERTO/PRESUPUESTADO | ✅ PASS (mismo estado por transición automática) |
| CA4 Print CERRADO | ✅ PASS |
| CA5 Total MO correcto | ✅ PASS |
| CA6/CA7 Preventivo | ✅ Cubierto (mismo código) |

### Escenario `trabajaConManoDeObra = false` → ✅ PASS (fix 2026-06-01)

Fix aplicado por Ivan Velazquez en `TicketsController.php` y `TicketDatosGenerales.js`.

**Comportamiento correcto post-fix:**
- `repuestos`: todos los ítems (Producto + MO juntos)
- `manoDeObraItems`: vacío (`collect([])`)
- Solo las tareas van a sección MO

**Evidencia:** `GET /tickets/print-data-pdf/576` → repuestos(2): Repuesto Default + Mano de Obra Default | manoDeObraItems(0) ✅

**QA Report:** [VEC-3256](https://vecfleet-kanban.atlassian.net/browse/VEC-3256)

## Gotchas técnicos
- Payload presupuesto usa `costo` (no `precio`) para el precio del ítem — mapeado en TicketsPresupuestosRepository.php:631
- Item 31 (Repuesto Default) y 32 (Mano de Obra Default) tienen `costo_fijo` — no se puede sobreescribir el monto
- Config default en config-business.php.sample es `false`
- La transición ABIERTO → PRESUPUESTADO ocurre automáticamente al crear el presupuesto
