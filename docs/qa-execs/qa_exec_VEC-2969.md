---
name: qa-exec-vec-2969
description: "Camino completo de ejecución regresiva para VEC-2969 Activos Vinculados — prerrequisitos, pasos API, assertions y gotchas"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3ba4e115-0704-4be3-b075-1acfc8cfa7db
---

## Feature
Vinculación de activos: dos móviles se relacionan con trazabilidad histórica. Un activo actúa como **principal** y el otro como **asociado**. Relación activa = `fecha_hora_fin` ausente.

## Prerrequisitos

| Item | Valor |
|---|---|
| Config | `moviles.vinculacionActivos.habilitado = true` |
| Entorno | vec-dev |
| Móviles recomendados | IDs ≥ 22 (sin historial de relaciones previas) |
| Auth | `POST /public/auth/login` con `usuario`/`clave` → `resp.usuario.token` |
| Timezone | **UTC-3 (Argentina)** — generar timestamps con `new Date(Date.now() - 3*3600*1000).toISOString().slice(0,19).replace('T',' ')` |

## Flujo de ejecución happy path

### 1. Crear relación
```
POST /movil-relaciones
Body: { "activo_principal_id": 22, "activo_asociado_id": 23, "fecha_hora_inicio": "<timestamp_ar>" }
→ 201, body con id de la relación creada
```

### 2. Verificar relación activa
```
GET /movil-relaciones/activa?movil_id=22
→ 200, objeto con activo_principal_id, activo_asociado_id, fecha_hora_inicio
→ campo fecha_hora_fin AUSENTE (no null — ausente) = relación activa
```

### 3. Ver historial
```
GET /movil-relaciones?movil_id=22
→ 200, array con al menos 1 elemento
→ la relación recién creada aparece en el array
```

### 4. Cerrar relación
```
PATCH /movil-relaciones/{id}/cerrar
Body: { "fecha_hora_fin": "<timestamp_ar>" }
→ 200
```

### 5. Verificar cierre
```
GET /movil-relaciones/activa?movil_id=22
→ 404 o 200 vacío (ya no hay relación activa)
GET /movil-relaciones?movil_id=22
→ 200, la relación ahora tiene fecha_hora_fin en el historial
```

## Casos de borde validados

| Caso | Request | Respuesta esperada |
|---|---|---|
| Autovinculación | POST con `activo_principal_id == activo_asociado_id` | 400 |
| Solapamiento temporal | POST con mismo par de IDs mientras hay relación activa | 400 |
| Asociado con relación activa | POST usando un asociado que ya tiene relación activa | 400 |
| Cierre con fecha anterior al inicio | PATCH con `fecha_hora_fin < fecha_hora_inicio` | 400 `la_fecha_de_cierre_no_puede_ser_anterior_a_la_fecha_de_inicio` |

## Gotchas críticos

- **Timezone**: el servidor interpreta datetime strings como hora local argentina (UTC-3). Enviar UTC hace que el inicio quede 3h en el futuro → fallo al sincronizar.
- **Campo ausente ≠ null**: la API omite `fecha_hora_fin` en relaciones activas. No buscar `null`, buscar ausencia del campo.
- **`/activa` solo devuelve relaciones vigentes HOY**: relaciones con `fecha_hora_inicio` futuro NO aparecen.
- **Verificar solapamiento antes del test**: usar `/activa` y el historial completo para confirmar que el par de móviles está libre.

## Cobertura de sub-features

| Sub-feature | Card | CAs | Resultado |
|---|---|---|---|
| Modelo de datos + lógica base + validaciones | VEC-3017, VEC-3018, VEC-3019 | 10 TCs API | ✅ VEC-3131 |
| Gestión manual desde Vehículos + visualización | VEC-3020, VEC-3027 | 9 TCs UI | ✅ VEC-3131 |
| Actualización desde checklist | VEC-3021 | 12 TCs (8 API + 4 UI) | ✅ comentario VEC-3133 |
| Importador de Vehículos | VEC-3022 | 6 TCs API | ✅ VEC-3146 |

## Specs de automatización
- `vecfleet-automation-test/tests/VEC-2969-vinculacion-activos/vec-2969-api.spec.js` — 10 TCs API
- `vecfleet-automation-test/tests/VEC-2969-vinculacion-activos/vec-2969-web.spec.js` — 9 TCs UI
- `vecfleet-automation-test/tests/VEC-3021-checklist-activo-vinculado/vec-3021-api.spec.js` — 8 TCs
- `vecfleet-automation-test/tests/VEC-3022-importador-activo-asociado/vec-3022-api.spec.js` — 6 TCs
