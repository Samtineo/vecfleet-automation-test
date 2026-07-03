---
name: qa-exec-vec-3343
description: "QA Exec para VEC-3343 — Grilla de Cargas de Combustible: filtros (conductor/tarjeta/proveedor), columna Proveedor sortable, tooltip de tarjeta y export a Excel. Entorno vec-dev."
metadata:
  type: project
---

# VEC-3343 — Grilla de Cargas de Combustible (filtros, columna, tooltip, export)

Dev: Julian Quino. PR #2125 (en develop). Entorno vec-dev. QA Report VEC-3457. Resultado 8/9 CAs PASS + 1 no-ejecutable (code-verified).

## Feature

Enriquecimiento de la grilla de Combustibles:
- Filtros por conductor (`conductor_informado`), tarjeta y proveedor (búsqueda parcial LIKE).
- Columna Proveedor sortable.
- Tooltip del control de tarjeta con el número.
- Export a Excel con 5 columnas de controles (i18n ES/PT/EN/es-abmx) + tarjeta, agregadas al final.

## Entorno

- Base API: `https://vec-dev.vecfleet.io/ws/Public/index.php/api`
- Auth: `POST /public/auth/login` (usuario `stineo`); token en header `Authorization-Token`.

## Prerrequisitos

- Sesión autenticada en vec-dev con perfil que tenga acceso al módulo Combustibles.
- Datos de prueba disponibles en la grilla (ver sección Datos de prueba).
- Para CA07 (tooltip sin tarjeta) hace falta al menos una carga sin tarjeta de combustible; vec-dev NO tiene ese dato → CA no ejecutable por API/UI, se verifica por código.

## Endpoints usados

| Método | Endpoint | Para qué |
|---|---|---|
| GET | `/api/combustibles/grid/{fechaInicio}/{fechaFin}?page=0&perPage=100&conductorInformado=&tarjeta=&proveedorCarga=&proveedorCargaSort=asc\|desc` | Grilla con filtros y sort de proveedor. Respuesta `{combustibles:[{conductor_informado,tarjeta_numero,proveedor_carga,...}], pagination:{count}}`. |
| POST | `/api/combustibles/exportar-excel` | Export a Excel (xlsx directo). |

## Receta de ejecución (API, vec-dev)

- **Grilla:** `GET /api/combustibles/grid/{fechaInicio}/{fechaFin}?page=0&perPage=100&conductorInformado=&tarjeta=&proveedorCarga=&proveedorCargaSort=asc|desc` (header `Authorization-Token`). Respuesta `{combustibles:[{conductor_informado,tarjeta_numero,proveedor_carga,...}], pagination:{count}}`. OJO: paginación 0-indexed (page=0 = primera página; con page=1 y perPage>matches da 0 → NO es bug, es la 2da página).
- **Export:** `POST /api/combustibles/exportar-excel` (JSON) con `fechaInicio,fechaFin,conductorInformado,tarjeta,proveedorCarga` + `colsAExportar` (objeto columna→bool; las nuevas vienen en false: `tarjeta, controlUbicacion, controlTanque, controlRendimiento, controlTarjeta, controlDistancia`). Devuelve xlsx directo.
- **Verificar filtros:** que todas las filas devueltas matcheen. **Verificar export:** headers nuevos al final (idx 25-30) + filas = total filtrado.

## Datos de prueba (vec-dev)

- Conductor "MENDIZABAL" (~7-9 cargas).
- Tarjeta "1-246520-00175-3-3" (~10 cargas).
- Proveedor "PetroTest" (23) / "Ultragas" (muchas).

## Casos de prueba

| CA | Escenario | Método | Resultado | Observación |
|---|---|---|---|---|
| CA01 | Filtro por conductor | API+UI | ✅ PASS | Columna Conductor no habilitada en grilla vec-dev (config); se validó por efecto del filtro. |
| CA02 | Limpiar filtros | UI | ✅ PASS | |
| CA03 | Filtro por tarjeta | API+UI | ✅ PASS | |
| CA04 | Filtro por proveedor + columna sortable | API+UI | ✅ PASS | |
| CA05 | Filtros combinados | API+UI | ✅ PASS | |
| CA06 | Tooltip con número de tarjeta | UI | ✅ PASS | `data-original-title` = "Tarjeta: {n}". |
| CA07 | Tooltip sin tarjeta | — | 📋 NO-EJECUTABLE | vec-dev no tiene cargas sin tarjeta; code-verified: front muestra "La carga se realizó sin tarjeta de combustible" sin número. |
| CA08 | Export: columnas nuevas al final | API+UI | ✅ PASS | |
| CA09 | Export: respeta filtro | API+UI | ✅ PASS | |

## Gotchas / notas

- Filtros = LIKE parcial; conductor por `conductor_informado`; tarjeta/tooltip por número (confirmado por Julian).
- El número del tooltip aparece junto al mensaje de estado del control (control INVALIDA/sin-comprobación); en cargas válidas el mensaje es "Carga realizada con tarjeta".
- Columna Conductor no habilitada en la grilla de vec-dev (config) → CA01 se validó por efecto del filtro.
- Suite Playwright observable: `tests/VEC-3343-combustibles-grid/` (spec + pages/), commit `0428f83`. Reporte HTML con trazas/videos vía `npx playwright show-report` (`playwright-report/` untracked).
- El endpoint de grilla con `perPage` muy grande + filtro puede dar 0 (quirk de paginación 0-indexed); usar `page=0` y `perPage` razonable.

## QA Report

VEC-3457 — https://vecfleet-kanban.atlassian.net/browse/VEC-3457
Card: VEC-3343 — https://vecfleet-kanban.atlassian.net/browse/VEC-3343
