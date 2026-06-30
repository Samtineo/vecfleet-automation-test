---
name: qa-exec-VEC-3363
description: "QA exec VEC-3363: filtro de rango de fechas en listado de inspecciones de llantas + export. 10/11 API + 4/4 UI PASS. Bug loader (error backend) corregido y re-testeado."
metadata:
  node_type: memory
  type: project
  originSessionId: current
---

# VEC-3363 — Filtro de fechas en inspecciones de llantas (módulo Llantas)

**Feature:** filtro de rango de fechas ("Fecha Desde"/"Fecha Hasta" + botón Buscar) en el **listado de inspecciones de llantas**, y el **export a Excel hereda el mismo filtro**. (Título de la card dice "exportación" pero el grueso es el filtro del listado + fix de un bug de loader.)

## Endpoints
- Listado: `GET /api/llantainspecciones?fecha_desde&fecha_hasta` (+ filtros existentes: id, persona, movil, movil_id, *Sort, page, perPage). Filtro en `LlantaInspeccionController::queryFilters` / `Service::queryFilters`.
- Export: `POST /api/llantainspecciones/exportar-excel` — body `colsAExportar` (Array, type-hint estricto: si no se manda → **500 TypeError**). El front reenvía el mismo querystring → el export hereda fecha_desde/fecha_hasta. **Es 1 fila por MEDICIÓN** (no por inspección) — `LlantaInspeccionRepository::export` itera mediciones.

## Resultados — 10/11 API + 4/4 UI PASS
- CA1-CA4 filtro (desde/hasta/rango/sin fechas) ✅; CA5/CA6 bordes (día completo) ✅; CA7 export respeta filtro ✅; CA8 fecha+móvil AND ✅; CA9 rango invertido → vacío ✅; CA11 no-regresión VEC-3211 (`llantasdemovil/42` 1 fila) ✅.
- **CA10 (UI loader):** 4/4 PASS tras el fix. Spec Playwright: `vecfleet-automation-test/tests/VEC-3363-llantas-filtro-fechas/loader.spec.js`.

## Bug encontrado y corregido (loader)
Al presionar Buscar, si la request **fallaba** (500/red/timeout), el loader quedaba colgado para siempre. Causa: `LlantaInspeccionesGrid.js` `dataTableUpdate` hacía `setLoading(false)` solo en `.then`; `Utils.getData` usa **axios** (rechaza en non-2xx) → sin `.catch/.finally` el loading quedaba en true. **Fix de Iván (2026-06-30):** mover `setLoading(false)` a `.finally`. Re-test 2026-06-30: 4/4 PASS, incluido el caso del 500. ✅

## Gotchas
- **TZ local UTC-3 (no UTC):** `created_at` se guarda en hora local Buenos Aires (`App.php:193` `date_default_timezone_set('America/Argentina/Buenos_Aires')`). El filtro compara fecha local vs created_at local → sin desfase de borde. **Contradice `qa_technique_timezone` ("restar 3h al UTC")** para timestamps generados por la app → ese memo está sobre-generalizado.
- `fecha_desde` no agrega `00:00:00` explícito (funciona por casteo MySQL); `fecha_hasta` sí agrega `23:59:59`. Frágil pero funcional.
- **Crear ticket — límite de tickets activos:** `POST /tickets` puede dar 400 `correctivosAbm.max_tickets_blocked_generico` si el móvil llegó al máximo de tickets activos. Probar con otro móvil.
- **PowerShell 5.1 — leer el body de error:** `Invoke-RestMethod` consume el stream del error; el mensaje está en `$_.ErrorDetails.Message`, NO en `GetResponseStream()` (que da vacío).

## QA Report
VEC-YYYY (Tarea, label test) — a completar. Card VEC-3363 → Finalizada.
