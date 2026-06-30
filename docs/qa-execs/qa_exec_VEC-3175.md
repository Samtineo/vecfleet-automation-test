---
name: qa-exec-VEC-3175
description: Prerrequisitos, endpoints y gotchas para regresión de columna y filtro de Unidad en grilla de Formularios
metadata:
  type: project
  originSessionId: current
---

## Card
VEC-3175 — Checklist | Columna y filtro de Unidad en la grilla de Formularios  
QA Report: [VEC-3247](https://vecfleet-kanban.atlassian.net/browse/VEC-3247) ✅ 5/5 PASS

## Resultado
5/5 CAs PASS | vec-dev | 2026-05-30

## Endpoints clave

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/formulario/newGrid` | Campo `movilUnidad` en cada registro |
| GET | `/formulario/newGrid?unidad=<valor>` | Filtro exacto por unidad (param: `unidad`, NO `movilUnidad`) |
| GET | `/formulario/unidades?q=<texto>` | Autocomplete incremental para el multi-select |

## Datos de prueba (vec-dev)

| Unidad | Formularios | movil_id |
|---|---|---|
| CPV6A93 | 17 | 4 |
| RNE4J11 | 2 | — |

## Comportamiento verificado

- **Filtro exacto** (`?unidad=CPV6A93`): devuelve solo registros de esa unidad, sin contaminación
- **Autocomplete** (`?q=CP` → `[CPV6A93]`, `?q=R` → 7 opciones): búsqueda por substring, no por prefijo
- **Sin query** (`/formulario/unidades`): devuelve array vacío — normal, no carga todo sin texto
- **Multi-select**: el frontend usa chips/etiquetas; funciona correctamente (no usar `unidad[]=` — da 500)
- **Sort**: implementado client-side en el frontend; no pasa parámetros de sort al API
- **CA-E1**: `?unidad=ZZZZ9999` → count=0, array vacío

## Gotchas

- El param de filtro en la API es `unidad`, NO `movilUnidad` (aunque el campo en el response se llama `movilUnidad`)
- `unidad[]=A&unidad[]=B` (array PHP-style) → 500 Internal Server Error; el frontend usa formato propio (chips)
- El sort es client-side: no testear via API params, testear en UI
- `formulario/unidades` sin `?q=` devuelve `[]` — es el comportamiento esperado
