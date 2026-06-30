---
name: qa-exec-vec-3189
description: "Ejecución QA de VEC-3189: Ajustes visuales/funcionales en grilla de Clasificaciones de Ítems — filtro multiselect, chips, renombre Producto"
metadata:
  node_type: memory
  type: project
  originSessionId: current
---

## Feature

Ajustes en la grilla de Administración de Clasificaciones (módulo Ítems / Pañol):

1. Columna "Aplica a": "Repuesto/Producto" → **"Producto"** (solo en esta grilla)
2. Filtro "Aplica a": pasa a **multiselección**, vacío por defecto = Todos
3. Columna "Aplica a": muestra **chips** por nombre (fondo `#6b6f82a8`); AMBOS muestra dos chips ("MO" + "Producto"), sin texto "Ambos"

**Card:** VEC-3189 (subtarea de VEC-3149)
**Entorno:** vec-dev
**Estado:** 9/9 PASS + 1 observación no bloqueante

## Endpoint

`GET /api/item/clasificaciones`

| Param | Tipo | Descripción |
|---|---|---|
| `tipoItem` | int o `"1,2"` | Filtro por tipo. Comma-separated para múltiples valores. `tipoItem[]=` NO es válido |
| `nombre` | string | Filtro por nombre |
| `showInactivos` | bool | Incluir inactivas |
| `page` / `perPage` | int | Paginación |

## Modelo — tipoItemId

| Valor | Constante | Descripción |
|---|---|---|
| 0 | `TIPO_ITEM_AMBOS` | Aplica a MO y Producto |
| 1 | `TIPO_ITEM_PRODUCTO` | Solo Producto |
| 2 | `TIPO_ITEM_MANO_DE_OBRA` | Solo Mano de Obra |

## Comportamiento del filtro tipoItem

| Modo | Condición | Lógica | Ejemplo |
|---|---|---|---|
| Laxo | 1 solo tipo seleccionado | Incluye registros de ese tipo + AMBOS | `tipoItem=1` → PRODUCTO + AMBOS |
| AND restrictivo | 2+ tipos seleccionados | Solo registros que coincidan con todos | `tipoItem=1,2` → solo AMBOS |

## Casos de prueba

| CA | Escenario | Resultado |
|---|---|---|
| CA1 | Sin filtro → todos | ✅ 4 registros |
| CA2 | `?tipoItem=1` (laxo) | ✅ 4 registros (DEFAULT + 3 AMBOS) |
| CA3 | `?tipoItem=2` (laxo) | ✅ 3 registros (solo AMBOS) |
| CA4 | `?tipoItem=1,2` (AND) | ✅ 3 registros (solo AMBOS) |
| CA5 | Chip PRODUCTO → texto "Producto" | ✅ PASS (UI) |
| CA6 | Chip AMBOS → dos chips "MO" y "Producto" | ✅ PASS (UI) |
| CA7 | Color chip `#6b6f82a8` | ✅ PASS (UI) |
| CA8 | Filtro vacío por defecto → todos | ✅ PASS (UI) |
| CA9 | Filtro permite multiselección | ✅ PASS (UI) |

## Datos de vec-dev usados

| ID | Nombre | tipoItemId |
|---|---|---|
| 2 | Alternativo | 0 (AMBOS) |
| 9 | DEFAULT | 1 (PRODUCTO) |
| 1 | Original | 0 (AMBOS) |
| 3 | Reacondicionado | 0 (AMBOS) |

## Observación no bloqueante

**Flag "Ver inactivos"** filtra directamente al toglear, sin necesidad de presionar "Buscar". Comportamiento distinto al de otros módulos donde el filtro requiere presionar "Buscar". Reportado a producto — puede derivar en nueva card, incremental o deuda técnica.
