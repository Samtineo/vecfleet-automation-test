---
name: qa-exec-vec-3235
description: "Ejecución QA VEC-3235 — Configurar si tickets automáticos de Preventivos y Vencimientos heredan repuestos y MO del servicio"
metadata:
  node_type: memory
  type: project
  originSessionId: current
---

## Feature

Configuración por servicio de si los tickets automáticos (preventivos y vencimientos) heredan automáticamente los ítems (repuestos y mano de obra) del servicio al crearse. Dos toggles nuevos en el ABM de servicio: **Heredar Repuestos** y **Heredar MO**.

## Permisos y configs requeridos

| Ítem | Valor |
|---|---|
| Permiso para ver los toggles | `SERVICIOS_MODIFICAR_HERENCIA_ITEMS` |
| Config para mostrar sección ítems en UI | `servicios.repuestos.habilitado = 'true'` |
| Config para heredar repuestos (backend) | `tickets.trabajaConRepuestos.habilitado = 'true'` |
| Config para heredar MO (backend) | `tickets.trabajaConManoDeObra.habilitado = 'true'` |

> ⚠️ `servicios.repuestos.habilitado` controla la sección entera de ítems en el ABM — sin esto no se ven los toggles ni los ítems aunque el permiso esté presente.

## Métodos de generación de preventivos (PreventivosService)

Todos tienen el mismo bloque `heredar*` items:

1. **`generateTicketsFromPreventivosConPlan()`** — móviles WITH plan
2. **`generateTicketsFromPreventivosSinPlan()`** — km-based, sin filtro `whereNull(realizar_el)` (picks up ALL con km condition)
3. **`generarTicketsPorIntervaloTemporalSinPlan()`** — date-based (`realizar_el IS NOT NULL`), usa `DATE_SUB(realizar_el, INTERVAL intervalo_temporal_alertar_dias DAY) < CURDATE()`

**Gotcha**: Si `intervaloTemporalAlertarDias IS NULL` → `DATE_SUB(x, INTERVAL NULL DAY) = NULL` → nunca true. Servicio 37 (`--SERVICIO DEFAULT--`) tiene `intervalo_temporal_alertar_dias=NULL`.

## Bloque heredar items (PreventivosRepository.php, líneas 835–868)

```php
if (ConfigBusiness::get('tickets.trabajaConRepuestos.habilitado') === 'true'
    || ConfigBusiness::get('tickets.trabajaConManoDeObra.habilitado') === 'true') {
    $servicio = Servicio::find($preventivo->servicio_id);
    if (ConfigBusiness::get('tickets.trabajaConRepuestos.habilitado') === 'true'
        && $servicio->getHeredarRepuestos()) {
        if (ConfigBusiness::get('tickets.trabajaConManoDeObra.habilitado') === 'true') {
            $itemsServicio = $servicio->items->where('tipo', Item::PRODUTO);
        } else {
            $itemsServicio = $servicio->items;
        }
        // attach items to ticket...
    }
    if (ConfigBusiness::get('tickets.trabajaConManoDeObra.habilitado') === 'true'
        && $servicio->getHeredarManoObra()) {
        $itemsMO = $servicio->items->where('tipo', Item::MANO_DE_OBRA);
        // attach items to ticket...
    }
}
```

## Constantes Item.php (línea 36-37)

```php
const PRODUTO = "Produto";       // 8 chars, con 'c' — ojo: NO es "Produto" portugués
const MANO_DE_OBRA = "Mano De Obra";
```

## Datos de prueba en vec-dev

| Entidad | ID/Valor | Notas |
|---|---|---|
| Servicio preventivo de prueba | 37 (`--SERVICIO DEFAULT--`) | `activo=false`, `intervaloTemporalAlertarDias=NULL`, `preventivoAlertarPrevios=1` |
| Servicio correctivo (CA05) | 4 (`CARTER`) | Items 8 (Produto qty=20) + 32 (Mano De Obra qty=5) |
| Móvil de prueba | 5 (`SDFJ-19-2`) | `km_actual=700` |
| Cron generación preventivos | `POST /api/crons/generacion-tickets-preventivos` | |
| Verificar items de ticket | `GET /api/items/items-and-servicio-by-ticket/{ticketId}` | Lee `ticket_items` directamente |

**Km condition para servicio 37, móvil 5:**
`realizarALos=700`, `preventivoAlertarPrevios=1` → `(700-1)=699 ≤ 700` → condition met ✅

## Gotcha crítico: PUT /servicios sin items[] limpia pivot table

```
PUT /servicios/{id}
```

Sin `items[]` en el body ejecuta `items()->sync([])` → limpia `servicio_item`. **Siempre incluir los ítems del servicio en el body al hacer PUT**, incluso si no se modifican.

**Body mínimo seguro:**
```
ticketTipo[id]=3&nombre=...&items[0][value]=8&items[0][cantidad]=1&items[1][value]=32&items[1][cantidad]=100&...
```

**Validator requiere `ticketTipo[id]` como entero no vacío** (línea 334 de ServicioController.php). Sin él → 400 "All of the required rules must pass".

## Resultados QA — 6/6 PASS

| CA | Descripción | Resultado |
|---|---|---|
| CA01 | `heredarRepuestos=true, heredarMO=true` → ticket tiene repuestos Y MO del servicio | ✅ PASS |
| CA02 | `heredarRepuestos=true, heredarMO=false` → ticket tiene solo repuestos | ✅ PASS |
| CA03 | `heredarRepuestos=false, heredarMO=true` → ticket tiene solo MO | ✅ PASS |
| CA04 | `heredarRepuestos=false, heredarMO=false` → ticket sin items heredados | ✅ PASS |
| CA05 | Solo `trabajaConRepuestos=true` (sin MO) → ticket hereda TODOS los items del servicio (no filtra por tipo) | ✅ PASS |
| CA06 | UI ABM servicio muestra toggles habilitados con permiso; deshabilitados sin permiso | ✅ PASS |

**QA Report:** [VEC-3299](https://vecfleet-kanban.atlassian.net/browse/VEC-3299) ✅

## Observaciones técnicas

- **CA05 comportamiento:** Cuando solo `trabajaConRepuestos=true` (no MO), el bloque de heredar no filtra por tipo — hereda todos los items de `$servicio->items` (incluye tanto Produto como Mano De Obra tipo items). Esto es por diseño del código: el filtro `Item::PRODUTO` solo aplica cuando AMBOS configs están activos.
- **`getHeredarRepuestos()` default:** retorna `true` cuando el campo es null en DB — heredar activo por defecto.
- **CA06 requiere `servicios.repuestos.habilitado = 'true'`:** config separada de `tickets.trabajaConRepuestos.habilitado`. Sin esta config, la sección entera de ítems/toggles no se renderiza en `ServiciosAbm.js`.
