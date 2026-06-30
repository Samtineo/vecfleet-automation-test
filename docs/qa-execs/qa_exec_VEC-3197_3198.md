---
name: qa-exec-vec-3197-3198
description: "QA conjunto VEC-3197 + VEC-3198 — Optimización N+1 en grilla de móviles. 8/8 PASS. QA Report: VEC-3253"
metadata: 
  node_type: memory
  type: project
  originSessionId: ae01135e-d1eb-4594-90d4-8d278a96574e
---

## Features

**VEC-3197** — Lazy load de `GET /tickets/gestoriaAbiertos/movil/{id}`: eliminado del `useEffect` de montaje en `MovilesGridRow.jsx`. Ahora solo se llama cuando el usuario intenta cambiar el estado del móvil (`changeEstado()`).

**VEC-3198** — Nuevo endpoint bulk `GET /moviles/moviles-asignados?ids=...` reemplaza N requests individuales a `/moviles/movil-asignado/{id}`. `MovilesGrid.jsx` hace 1 fetch bulk al cargar y pasa `movilAsignado` como prop a cada fila. Solo si `moviles.movil_reserva.habilitado = true`.

## Prerrequisitos

| Item | Valor |
|---|---|
| Entorno | vec-dev |
| Config para VEC-3198 | `moviles.movil_reserva.habilitado = true` (en vec-dev estaba en false — habilitar para testear) |
| Móvil con gestoría abierta | ID 6 (TGRC-30) — ticket 417 ABIERTO |
| Móviles sin gestoría | IDs 871–881 (todos retornan `[]`) |
| Móviles asignados como reserva (primera página) | IDs 4, 5, 8, 9 |

## Resultados QA — 8/8 PASS

| CA | Card | Descripción | Resultado |
|---|---|---|---|
| CA1 | Ambas | Grilla carga y muestra datos sin errores | ✅ PASS |
| CA2 | VEC-3198 | 1 solo request bulk en Network al cargar, sin requests individuales | ✅ PASS |
| CA3 | VEC-3198 | Columna "Vehículo Reserva" muestra dominio correcto para móviles asignados | ✅ PASS |
| CA4 | VEC-3198 | Asignar/desasignar reserva actualiza sin recargar página | ✅ PASS |
| CA5 | VEC-3198 | Endpoint bulk responde correctamente en 4 variantes | ✅ PASS (API) |
| CA6 | VEC-3197 | Sin requests a gestoriaAbiertos al cargar la grilla | ✅ PASS |
| CA7 | VEC-3197 | Inactivar móvil CON gestoría → diálogo de detección | ✅ PASS |
| CA8 | VEC-3197 | Inactivar móvil SIN gestoría → sin diálogo, flujo normal | ✅ PASS |

**QA Report:** [VEC-3253](https://vecfleet-kanban.atlassian.net/browse/VEC-3253)

## Endpoint bulk — comportamiento validado

`GET /moviles/moviles-asignados?ids=2,4,5,6,7,8,9,10,20,21`
→ `{"4":"CPV6A93","5":"SDFJ-19-2","8":"NJZ4789","9":"NJZ5636"}` HTTP 200

- IDs sin asignación → no aparecen en el mapa
- IDs inválidos mezclados → filtra los no-enteros, procesa solo válidos
- Sin param `ids` → HTTP 400 `"El parámetro ids es requerido"`

## Lógica de gestoría (VEC-3197)

```js
const activo = estadosActivos.findIndex(e => e === estado) !== -1;
(activo ? Promise.resolve([]) : getTicketsGestoria(movil.id)).then(tickets => {
    // Si activo → saltea el check (estado en estadosActivos)
    // Si !activo → consulta gestoriaAbiertos antes de inactivar
    if (!activo && tickets.length && Security.hasPermission('TICKETS_CANCELAR_GESTORIA')) {
        // Diálogo con opción de cancelar tickets
    } else if (!activo && tickets.length) {
        // Solo aviso bloqueante (sin permiso)
    }
})
```

**Con permiso `TICKETS_CANCELAR_GESTORIA`:** diálogo con botones "Cancelar Tickets" / "Continuar sin cancelaciones" — no es bloqueante.
**Sin permiso:** solo muestra aviso, es bloqueante hasta cancelar manualmente.

## Gotchas técnicos

- **`PUT /moviles/{id}/estado` da 500 en vec-dev** para cualquier estado — problema de entorno preexistente, no regresión de estas cards.
- **`movil_reserva.habilitado = false` en vec-dev** — habilitar en DBeaver para testear VEC-3198. El endpoint bulk existe y responde siempre, pero el frontend solo lo invoca si la config es `true`.
- **`es_reserva_asignada = 1`** en `MovilesGridRow`: muestra "Asignado a X" en la columna en vez de dropdown — es el vehículo siendo USADO como reserva de otro. No tiene dropdown porque ya está ocupado.
- **Badge estado OCIOSO grisado** si OCIOSO no está en `estadosActivos`/`estadosInactivos`/`estadosResaltados` del config → cae al default `#e3ebf3` con texto blanco invisible. Problema de config, no de código.
