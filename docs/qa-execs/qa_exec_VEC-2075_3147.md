---
name: qa-exec-vec-2075-3147
description: QA exec combinado — VEC-2075 (tabla peajes) + VEC-3147 (endpoint POST /api/telepeajes)
metadata:
  type: project
  originSessionId: 128ea87d-6278-46ce-9a4d-ffc471da7f9f
---

## VEC-2075 — Peajes: Creación de tabla

**Resultado:** 6/6 PASS. Ambiente: vec-dev. QA Report: **VEC-3202**.

**Migración:** `db/migrations/20260515173412_create_peajes_table.php`

**Estructura tabla `peajes`:**
- `id` bigIncrements, `movil_id` bigInteger, `fecha_hora_del_cruce` dateTime, `importe` decimal(10,2), `proveedor` varchar(255), `numero_de_tag` bigInteger
- `place_name` varchar(255) nullable, `address` varchar(500) nullable
- `created_at`, `updated_at` timestamps
- FK: `fk_peajes_movil` → moviles(id) ON DELETE CASCADE
- UNIQUE compuesto: `uq_peajes_movil_fecha` (movil_id, fecha_hora_del_cruce)
- Índices: `idx_peajes_movil_id`, `idx_peajes_fecha_hora_del_cruce`

**Observaciones de diseño:**
- `place_name`/`address` nullable = intencional: cuando `lugar_del_evento` no tiene separador (`/` o `-`), address = null
- UNIQUE en par (movil_id, fecha_hora_del_cruce) — NOT en numero_de_tag solo. Deduplicación semántica correcta.

| CA | Descripción | Resultado |
|---|---|---|
| CA1 | Columnas requeridas presentes | PASS |
| CA2 | NOT NULL donde corresponde; nullable correcto | PASS |
| CA3 | FK fk_peajes_movil presente | PASS |
| CA4 | decimal(10,2) acepta negativos | PASS |
| CA5 | dateTime en fecha_hora_del_cruce | PASS |
| CA6 | Migración aplicada (PR mergeado) | PASS |

---

## VEC-3147 — Endpoint POST /api/telepeajes

**Resultado:** 10/12 PASS + 2 bugs conocidos ya reportados. Ambiente: vec-dev. QA Report: **VEC-3202**.

**Endpoint:** `POST /api/telepeajes`
**Permiso:** `PEAJES_SYNC` (perfil ID 719 en vec-dev)
**Auth header:** `Authorization-Token: <token>`
**Middleware order (LIFO Slim 3):** PeajesValidation → ValidatePermissionsMiddleware → Handler

**Contadores respuesta:** `{insertados, duplicados, descartados, errores}`
- `insertados`: registro válido, dominio resuelto, no duplicado
- `duplicados`: UNIQUE (movil_id, fecha_hora_del_cruce) viola constraint
- `descartados`: dominio no existe en moviles
- `errores`: falla validateItem()

**validateItem() — reglas estrictas:**
- `numero_de_tag`: `is_int()` PHP — float JSON (870230.0) falla; int JSON (870230) pasa
- `importe`: `is_numeric()` — acepta negativos y decimales
- `fecha_hora_del_cruce`: ISO 8601 con timezone obligatorio (regex explícito)
- Campos requeridos: numero_de_tag, importe, proveedor, fecha_hora_del_cruce, dominio

**splitLugarDelEvento():** intenta `' / '` primero, luego `' - '`; si no hay separador → address = null

| CA | Descripción | Resultado |
|---|---|---|
| CA1 | Sin token → 401 | PASS |
| CA2 | Sin PEAJES_SYNC → 200 `[]` (Ghost Mode) | BUG CONOCIDO ⚠️ |
| CA3 | Array vacío `[]` → `{insertados:0,...}` | PASS |
| CA4 | Registro válido → `{insertados:1,...}` | PASS |
| CA5 | Mismo registro → `{duplicados:1,...}` | PASS |
| CA6 | Dominio inexistente → `{descartados:1,...}` | PASS |
| CA7 | Campo faltante → `{errores:1,...}` | PASS |
| CA8 | importe negativo → `{insertados:1,...}` | PASS |
| CA9 | numero_de_tag float JSON → `{errores:1,...}` | PASS |
| CA10a | Body objeto JSON `{}` → 200 `{errores:N}` en vez de 400 | BUG CONOCIDO ⚠️ |
| CA10b-d | Body string/null/número → 400 | PASS |
| CA11 | fecha sin timezone → `{errores:1,...}` | PASS |
| CA12 | Array mixto → contadores correctos | PASS |

**Bugs conocidos:**
1. **Ghost Mode:** `index.php` silencia ForbidenException con HTTP 200 `[]` (parche intencional, ya reportado)
2. **CA10a — is_array() bug:** PHP `is_array()` acepta tanto arrays JSON como objetos JSON en PeajesValidation.php

**Gotcha de entorno:** stineo no tenía PEAJES_SYNC al inicio. Agregar via `PUT /api/perfiles/719` con todos los permisos existentes + PEAJES_SYNC.

**Dominio de prueba vec-dev:** `TAM2F14` (movil válido resuelto)
