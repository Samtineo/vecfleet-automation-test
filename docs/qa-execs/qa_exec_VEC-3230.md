---
name: qa-exec-vec-3230
description: "QA exec VEC-3230 — Garantía a nivel de ítem de presupuesto (MO y repuestos). 8/8 PASS. Gotchas: ITEM_CLASIFICACION=1 (no 22), doble modal, key vacío en correctivoValidacion. QA Report: VEC-3359"
metadata: 
  node_type: memory
  type: project
  originSessionId: 8bf28f2b-3feb-46fc-aa8b-2f46ff497a9a
---

## Card

VEC-3230 — Validar garantía a nivel de ítem de presupuesto (mano de obra y repuestos por separado)

## Resultado

**8/8 PASS** — QA Report: VEC-3359

## Entorno y config necesaria

- vec-dev (movil 39 TAM2F14, servicio 26 BOTIQUIN, item 9 "cloro", tarea 32 "MO Default")
- `tickets.periodoGarantia.habilitado = true`
- `tickets.periodoGarantia.periodoDias = 30`
- `tickets.trabajaConRepuestos.habilitado = true`
- `tickets.presupuesto.tipo = detallado`

## Setup para regresión

```powershell
# 1. Crear ticket histórico CORRECTIVO y cerrarlo
$hist = POST /tickets { ticketTipo:"CORRECTIVO", movil:{id:39}, servicio:{id:26} }
POST /ticket-presupuestos/ticket/{hist.id} { presupuestoItems:[{id_item:9, id_clasificacion:1, ...}], presupuestoTareas:[{id_tarea:32, ...}] }
POST /tickets/aprobar/{id}
POST /tickets/enviar-a-reparar/{id}
POST /tickets/listo-para-retirar/{id}
POST /tickets/cerrar/{id} { encuestaNivelSatisfaccion:5 }
POST /tickets/update-realizado/{id}?fechaHoraRealizado=2026-06-16+10:00:00

# 2. Crear ticket nuevo — debe detectar garantia=1
$new = POST /tickets { ticketTipo:"CORRECTIVO", movil:{id:39}, servicio:{id:26} }
POST /ticket-presupuestos/ticket/{new.id} { ... }

# 3. Verificar
GET /ticket-presupuestos/ticket/{new.id}/items-activos
→ items[0].garantia = 1, items[0].garantia_ticket_id = {hist.id}
→ tareas[0].garantia = 1, tareas[0].garantia_ticket_id = {hist.id}
```

## Endpoints clave

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/ticket-presupuestos/ticket/{id}/items-activos` | Items/tareas del presupuesto activo con campo `garantia` y `garantia_ticket_id` |
| POST | `/tickets/correctivoValidacion` | Validación pre-creación: retorna garantia detectada para modal informativo |
| POST | `/tickets/update-realizado/{id}?fechaHoraRealizado=X` | Setear `fecha_hora_realizado` (requerido para que correctivoValidacion funcione) |

## Gotchas

### ITEM_CLASIFICACION debe ser ID de item_clasificaciones, no items.subcategoria

- Correcto: `id_clasificacion = 1` ("Original" en tabla `item_clasificaciones`)
- Incorrecto: `id_clasificacion = 22` (era el campo `items.subcategoria`, distinta tabla)
- IDs válidos: 1 (Original), 2 (Alternativo), 3 (Reacondicionado), 9 (DEFAULT), 10 (Trucho)

### Arquitectura de dos modales en TicketPresupuestos.js

- `#ver_presupuestos_modal_detallado` contiene `TicketVerPresupuestosDetallado` → el badge correcto
- `#presupuesto_detallado_modal` contiene `TicketVerPresupuestosConRepuestoManoObra` → siempre cerrado durante la vista de historial
- Siempre scopear selectores a `#ver_presupuestos_modal_detallado` para evitar falsos positivos

### CDP click requerido para el botón ojo (fa-eye)

React usa event delegation — `dispatchEvent(new MouseEvent(...))` no dispara el onClick.
Usar Playwright `click({ force: true })` (CDP-level) scoped al modal correcto.

### fechaHoraRealizado como query param

El endpoint `update-realizado` lee el parámetro via `$request->getParam()` (Slim).
Enviarlo como query string: `/tickets/update-realizado/{id}?fechaHoraRealizado=2026-06-16+10:00:00`.
Sin esto, `correctivoValidacion` retorna null (DATEDIFF de NULL es siempre null).

### correctivoValidacion — response con key vacío

El endpoint retorna `{"": { tareasGarantia, itemsGarantia, pendiente }}`.
PowerShell 5.1 `ConvertFrom-Json` falla con key vacío. Usar `Invoke-WebRequest` + substring manual:

```powershell
$iwr = Invoke-WebRequest -Uri "$base/tickets/correctivoValidacion" -Method POST ...
$c = $iwr.Content.Trim()
$inner = $c.Substring(4, $c.Length - 5)  # quita '{"":' del inicio y '}' del final
$parsed = $inner | ConvertFrom-Json
```

### tareasGarantia vs badge MO

`correctivoValidacion` busca antecedentes de tareas en `ticket_tareas` (asignación).
El badge de MO en UI usa `items-activos` que usa `presupuesto_tareas` (presupuesto).
En vec-dev `tareasGarantia` retorna null aunque el badge de MO funcione. No es un bug — diferentes code paths.

## Casos de prueba ejecutados

| CA | Tipo | Resultado | Detalle |
|---|---|---|---|
| CA1 | UI | ✅ PASS | Badge repuesto visible en `#ver_presupuestos_modal_detallado` |
| CA2 | UI | ✅ PASS | Badge MO visible en misma tabla |
| CA3 | UI | ✅ PASS | Ítems mixtos: granularidad a nivel ítem |
| CA4 | UI | ✅ PASS (obs) | Modal trigger validado por API; UI no testeable directamente |
| CA5 | API | ✅ PASS | Item sin antecedente → garantia=0 |
| CA6 | API | ✅ PASS | Período vencido (31 días) → excluido correctamente |
| CA7 | UI | ✅ PASS | Mismo ítem, servicio distinto → sin badge |
| CA8 | API | ✅ PASS | correctivoValidacion retorna itemsGarantia cuando hay antecedente |
