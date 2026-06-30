---
name: qa-exec-vec-3206
description: "Ejecución QA VEC-3206 — moviles_historial_estados: columnas estado_origen/estado_destino ampliadas de VARCHAR(20) a VARCHAR(30)"
metadata:
  node_type: memory
  type: project
  originSessionId: current
---

## Feature / Fix

Ampliación de columnas `estado_origen` y `estado_destino` en tabla `moviles_historial_estados` de VARCHAR(20) a VARCHAR(30). Solicitado por MELI-BR cuyos estados de móviles tienen hasta 30 chars.

**Migration:** `20260604101325_expand_estado_columns_in_moviles_historial_estados_table.php`

```php
$table->string('estado_origen', 30)->nullable()->change();
$table->string('estado_destino', 30)->nullable()->change();
```

## Endpoints relevantes

| Método | Endpoint | Descripción |
|---|---|---|
| PUT | `/moviles/{movilId}/estado` | Cambia estado del móvil (registra en historial) |
| GET | `/moviles/historial-estados?movil_id={id}` | Grilla de historial de estados |

**Permiso para historial:** `MOVILES_VER_HISTORIAL_ESTADOS`

**Permiso para cambiar estado:** OR entre `MOVILES_MODIFICAR_ESTADO_GRILLA`, `MOVILES_MODIFICAR_ESTADO_GRILLA_ACTIVOS`, `MOVILES_MODIFICAR_ESTADO_GRILLA_INACTIVOS`, `MOVILES_MODIFICAR_DATOS_GENERALES`

## Métodos que insertan en moviles_historial_estados

4 métodos en `MovilRepository.php` (lines 3226, 9199, 9299, 9366) + `FormularioController.php` (line 323 — vía checklist)

## Resultados QA — 4/4 PASS

| CA | Descripción | Resultado |
|---|---|---|
| CA01 | Schema: columnas son VARCHAR(30) confirmado en migration | ✅ PASS |
| CA02 | `estado_destino` de 29 chars almacenado sin truncar (DISPONIBLE_PARA_MANTENIMIENTO) | ✅ PASS |
| CA03 | `estado_origen` de 29 chars almacenado sin truncar (segunda transición) | ✅ PASS |
| CA04 | GET historial retorna estados completos en grilla | ✅ PASS |

**QA Report:** [VEC-3301](https://vecfleet-kanban.atlassian.net/browse/VEC-3301) ✅

## Datos de prueba usados

- Móvil 5 (SDFJ-19-2): OPERATIVO → DISPONIBLE_PARA_MANTENIMIENTO → OCIOSO
- Móvil 39 (TAM2F14): OPERATIVO → DISPONIBLE_PARA_MANTENIMIENTO → OCIOSO

## Gotcha de entorno vec-dev

La transición desde DISPONIBLE_PARA_MANTENIMIENTO (y desde OCIOSO) → OPERATIVO retorna 400 con error de negocio. Esta restricción de transición es preexistente e independiente de VEC-3206. Restauración realizada con estado `OCIOSO`.

Adicionalmente, móvil 5 tiene Tickets Preventivos activos que bloquean ciertas transiciones de estado (error: `movilRepository.errors.este_movil_tiene_Tickets_Preventivos_activos_no_puede_cambiar_estado`).
