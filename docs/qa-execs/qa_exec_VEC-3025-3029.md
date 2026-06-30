---
name: qa-exec-VEC-3025-3029
description: "Ejecución QA Tercer+Cuarto Bloque Activos Vinculados: VEC-3025 km herencia, VEC-3026 VyP, VEC-3028 snapshot tickets, VEC-3029 filtros grilla"
metadata:
  node_type: memory
  type: project
  originSessionId: 3ba4e115-0704-4be3-b075-1acfc8cfa7db
---

## Contexto

QA ejecutado el 2026-05-15. Entorno vec-dev.  
Moviles: P=39 (TAM2F14, CC=1), A=42 (NYC8912, CC=1).  
Token necesita refresh cada sesión vía `POST /public/auth/login`.

---

## VEC-3025 — Herencia sincrónica de km

**Endpoint:** `PUT /moviles/{id}/km` body `{"km": "<valor>"}`  
**Mecanismo:** `MovilRepository::updateKm()` calcula delta y lo propaga a todos los asociados con `fecha_hora_fin IS NULL` y `sync_avl = false`. Registro en `movil_uso_heredado` con UNIQUE `(movil_kilometros_id, activo_asociado_id)` + INSERT OR IGNORE para idempotencia.

### Casos de prueba

| CA | Escenario | Estado | Notas |
|---|---|---|---|
| CA1 | PUT km en P con relación activa → A hereda delta sincrónicamente | ✅ PASS | A heredó +500 km |
| CA2 | PUT km en P con delta=0 → A no cambia | ✅ PASS | |
| CA3 | PUT km en P con relación CERRADA → A no cambia | ✅ PASS | |
| CA4 | PUT km en P con A de `sync_avl=1` → sistema skipea herencia en A | ✅ PASS | id=43 (ECO002) habilitado desde UI; km no cambió |

### Gotchas técnicos

- Crear relación con campos snake_case: `activo_principal_id`, `activo_asociado_id`, `fecha_hora_inicio`
- Siempre usar Invoke-RestMethod (no WebRequest): evita timeouts en reads post-write
- Esperar `Start-Sleep -Milliseconds 300` entre write km y read km

---

## VEC-3026 — VyP usa km_actual actualizado

Sin PR propio. La herencia de VEC-3025 actualiza `km_actual` en el asociado, que `CalculoProximosVyP` usa directamente.

| CA | Escenario | Estado |
|---|---|---|
| CA5 | km_actual del asociado post-herencia es correcto para cálculo VyP | ✅ PASS |

**VEC-3026 no tiene UI validation requerida → aprobado.**

**VEC-3026 no tiene UI validation requerida → puede aprobarse.**

---

## VEC-3028 — Snapshot de relaciones en tickets

**Endpoint snapshot:** `GET /tickets/{ticketId}/snapshot-vinculacion`  
**Gate:** `moviles.vinculacionActivos.habilitado = true`  
**Body creación ticket:** `{"ticketTipo":"CORRECTIVO","movil":{"id":X},"centroCostos":{"id":1},"servicio":{"id":26}}`  
**Importante:** tickets CORRECTIVO y PREVENTIVO requieren campo `servicio` — sin él retorna 500 (bug preexistente, no relacionado con VEC-3028).

### Estructura del snapshot

```json
{
  "activo_principal": {"id": 39, "dominio": "TAM2F14", "modelo": "MODELO DEFAULT"},
  "activo_asociado": {"id": 42, "dominio": "NYC8912", "modelo": "MODELO DEFAULT"},
  "fecha_hora_inicio_relacion": "2026-05-15 18:26:17",
  "fecha_hora_fin_relacion": null,
  "estado": "Activo",
  "fecha_hora_referencia": "2026-05-15 18:39:34"
}
```

Cuando no hay relación activa: retorna `[]` (array vacío, tipo `System.Object[]`).

### Casos de prueba

| CA | Escenario | Estado | Tickets usados |
|---|---|---|---|
| CA6 | Ticket sobre PRINCIPAL (P=39) con relación activa → snapshot.activo_asociado.id = 42 | ✅ PASS | ticketId=600 |
| CA7 | Ticket sobre ASOCIADO (A=42) con relación activa → snapshot.activo_principal.id = 39 | ✅ PASS | ticketId=601 |
| CA8 | Ticket sobre P=39 SIN relación activa → snapshot = [] | ✅ PASS | ticketId=602 |
| CA9 | Snapshot del CA6 ticket tras cerrar relación → mismo contenido, estado="Activo", fecha_fin=null | ✅ PASS | ticketId=600 recheck |

### UI

Botón "Ver relaciones al momento de apertura" en sección **Datos Generales** del ticket. ✅ PASS — validado manualmente en tickets 600, 601 (con relación) y 602 (sin relación).

---

## VEC-3029 — Filtros y exportación grilla de móviles

**Endpoint:** `GET /moviles/newGrid?page=0&perPage=N`  
**Gate:** `moviles.vinculacionActivos.habilitado = true`

### Filtro "Estado de vinculación" — 6 opciones

| Opción | Descripción |
|---|---|
| Con relación activa | Moviles con al menos una vinculación vigente (principal o asociado) |
| Es principal | Moviles con uno o más activos asociados |
| Es asociado | Moviles vinculados a un principal |
| Sin relación | Moviles sin vinculación activa |
| Asociables | Tipo de modelo permite vinculación Y sin principal activo |
| Con historial | Tuvieron al menos una vinculación en cualquier momento |

### Parámetro del filtro

`estadoVinculacion` — query param directo en `/moviles/newGrid`. Implementado en `MovilesService::queryFilters()`. Deployment del PR llegó a vec-dev el fin de semana del 2026-05-18.

### Nuevas columnas Excel

- **Rol de vinculación:** "Principal" o "Asociado"
- **Activo vinculado:** dominio del activo relacionado

### Casos de prueba

| CA | Escenario | Estado |
|---|---|---|
| CA10 | Filtro `con_relacion` → solo moviles vinculados | ✅ PASS | 15 de 1790 — P=39 y A=42 presentes |
| CA11 | Filtro `es_principal` → solo principales | ✅ PASS | 8 — P=39 presente, A=42 ausente |
| CA12 | Filtro `es_asociado` → solo asociados | ✅ PASS | 8 — A=42 presente, P=39 ausente |
| CA13 | Filtro `sin_relacion` → excluye P=39 y A=42 | ✅ PASS | 1775 — ambos ausentes |
| CA14 | Filtro `con_historial` → incluye P=39 y A=42 | ✅ PASS | 48 — ambos presentes |
| CA15 | Filtro "Asociables" (UI) | ✅ PASS |
| CA16 | Modal Excel muestra "Rol de vinculación" y "Activo vinculado" | ✅ PASS |
| CA17 | Excel contiene "Principal"/"Asociado" y dominio correcto | ✅ PASS |

---

## Observaciones globales

- **PS5.1 gotcha:** `$VAR:` en strings dobles se parsea como drive reference (e.g. `$HKLM:`). Usar `${VAR}:` o concatenación con `+`.
- **PS5.1 gotcha:** `??` (null-coalescing) no disponible. Usar `if/else`.
- **Relación creation body:** usar snake_case (`activo_principal_id`, `activo_asociado_id`, `fecha_hora_inicio`).
- **Ticket creation 500:** CORRECTIVO/PREVENTIVO requieren `servicio` en el body.
