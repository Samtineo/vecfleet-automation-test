---
name: qa-exec-vec-3360
description: "QA Exec para VEC-3360 — Filtro turnoAsignado en la grilla de Tickets (fecha_hora_turno NOT NULL/NULL). Entorno vec-dev."
metadata:
  node_type: memory
  type: project
  originSessionId: current
---

## Entorno
- vec-dev. URL base: `https://vec-dev.vecfleet.io/ws/Public/index.php/api`
- Config relevante: `tickets.fechaHoraTurno.habilitado` (default `false`).
  - Gatea SOLO la visibilidad UI: el filtro y la columna en la grilla.
  - El backend filtra por presencia del parámetro `turnoAsignado` independientemente del valor de esta config.

## Feature
Filtro `turnoAsignado` en la grilla de Tickets. Permite filtrar tickets por si tienen turno asignado o no:
- `turnoAsignado=true` → `fecha_hora_turno IS NOT NULL`
- `turnoAsignado=false` → `fecha_hora_turno IS NULL`
- param vacío / ausente → sin filtro (devuelve todos)

## Implementación / rutas
- Implementado en AMBAS rutas: `/tickets/newGrid` y `/ticket-grid`, con código idéntico.
  - Por eso NO aplica el riesgo INC-007 que se preveía: no hay divergencia de comportamiento entre rutas.
- Ruta productiva en vec-dev: `/tickets/newGrid` (porque `tickets.grilla.tabla_fuente="tickets"`).

## Prerrequisitos

### Config en config_business
- Para los CAs de API (CA1-CA9, CA11): NO requiere config especial. El backend filtra por presencia del param sin importar el valor de `tickets.fechaHoraTurno.habilitado`.
- Para los CAs visuales (CA10, CA6-visual): poner `tickets.fechaHoraTurno.habilitado=true` en vec-dev (vía DBeaver) para que el filtro y la columna sean visibles en la UI.
  - RECORDATORIO: revertir a `false` (default) al terminar la validación visual. (Pendiente del usuario; QA no tiene conexión MySQL.)

### Datos de prueba
- Tener en vec-dev tickets con `fecha_hora_turno IS NOT NULL` y tickets con `fecha_hora_turno IS NULL` para verificar ambos lados del filtro.
- El campo `fecha_hora_turno` se setea vía `PATCH /tickets/{id}` con el campo `fechaHoraTurno`.

### Permisos
- No requiere permiso específico para el filtro de grilla.

## Endpoints usados

| Método | Endpoint | Para qué |
|---|---|---|
| POST | `/public/auth/login` | Obtener token de autenticación |
| GET | `/tickets/newGrid?turnoAsignado=true\|false` | Grilla productiva con filtro turnoAsignado |
| GET | `/ticket-grid?turnoAsignado=true\|false` | Grilla "en test" con la misma lógica de filtro |
| PATCH | `/tickets/{id}` | Setear/limpiar `fechaHoraTurno` para armar datos de prueba |

## Casos de prueba

| CA | Escenario | Resultado | Observación |
|---|---|---|---|
| CA1 | `turnoAsignado=true` devuelve solo tickets con `fecha_hora_turno IS NOT NULL` | ✅ PASS | API, ruta `/tickets/newGrid` |
| CA2 | `turnoAsignado=false` devuelve solo tickets con `fecha_hora_turno IS NULL` | ✅ PASS | API |
| CA3 | Param vacío / ausente no filtra (devuelve todos) | ✅ PASS | API |
| CA4 | El filtro funciona en la ruta productiva `/tickets/newGrid` | ✅ PASS | Ruta productiva en vec-dev (`tabla_fuente="tickets"`) |
| CA5 | El filtro funciona en `/ticket-grid` (misma lógica, código idéntico) | ✅ PASS | API. No aplica INC-007 |
| CA6 | Export a Excel respeta el filtro `turnoAsignado` (API) | ✅ PASS | API |
| CA6-visual | Export desde la UI respeta el filtro | ✅ PASS | Validado visualmente por el usuario |
| CA7 | Paginación y count consistentes con el filtro aplicado | ✅ PASS | API |
| CA8 | Param basura (string no booleano) castea con `FILTER_VALIDATE_BOOLEAN` sin generar 500 | ✅ PASS | API |
| CA9 | Combinación del filtro con otros filtros de la grilla funciona | ✅ PASS | API |
| CA10 | UI gating: con `tickets.fechaHoraTurno.habilitado=true` el filtro y columna son visibles en UI; con `false` no | ✅ PASS | Validado visualmente por el usuario |
| CA11 | El backend filtra aunque la config UI esté en `false` (la presencia del param manda) | ✅ PASS | API |

**Resultado: 11/11 PASS** (CA1-CA9 + CA11 por API; CA10 + CA6-visual validados visualmente).

## Notas no-bug (2)
1. El backend filtra por `turnoAsignado` aunque `tickets.fechaHoraTurno.habilitado` esté en `false`. Es el patrón estándar de los ~25 filtros de la grilla de Tickets: el gate de config solo controla visibilidad UI, no el backend. El dato no es sensible. NO es bug.
2. En `/ticket-grid` (grilla "en test", NO la productiva en vec-dev) el campo aparece desincronizado respecto a la grilla productiva. Fuera de scope de esta card. Anotado como observación para futuras regresiones.

## Gotchas
- **Default `tickets.fechaHoraTurno.habilitado=false`.** Para validar los CAs visuales (CA10, CA6-visual) el usuario flipeó la config a `true` en vec-dev vía DBeaver. RECORDATORIO: conviene revertirla a `false` (default) al terminar la validación. QA no tiene conexión MySQL; es un pendiente del usuario.
- **Backend filtra por presencia del param, no por la config.** El gate de config solo afecta la UI. Si alguien arma una request directa con `turnoAsignado`, el filtro aplica aunque la config esté en `false`.
- **Param basura se castea con `FILTER_VALIDATE_BOOLEAN`:** no rompe (no 500); valores no reconocidos se tratan según el casteo (por ejemplo, no-booleanos caen como `false`/sin filtro según el resultado del cast).
- **`/ticket-grid` desincronizado:** no es la grilla productiva en vec-dev. Si una regresión futura muestra comportamiento distinto entre `/ticket-grid` y `/tickets/newGrid` en el campo turno, recordar que esa desincronización ya estaba anotada y queda fuera del scope de VEC-3360.

## QA Report
VEC-3360 — comentario en VEC-3360 (pendiente publicación; auth de Atlassian expirada al momento del cierre).
