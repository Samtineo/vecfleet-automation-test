---
name: qa-exec-vec-3182
description: "Prerrequisitos, flujo y CAs para regresión de VEC-3182 EPEC | Facturas > Rechazar — constraint violation al rechazar con gemela RECHAZADA"
metadata:
  node_type: memory
  type: project
  originSessionId: fddf5493-1cbd-4827-9450-1f1d7cb5ca38
---

## Feature
Fix del índice único `factura_unica` en tabla `facturas`. El índice original incluía el campo `estado` — (gerenciador+tipo+punto_de_venta+numero+estado) — lo que impedía tener dos registros con estado=RECHAZADA para la misma combinación de datos. La migration `20260522095730_eliminar_indice_unico_factura_unica.php` lo elimina y agrega índice no-único `idx_facturas_gerenciador_tipo_pv_numero`. La validación de unicidad queda a nivel app: al crear, se verifica que no exista otra con `estado != RECHAZADA`.

## Prerrequisitos

| Item | Valor |
|---|---|
| Entorno | vec-dev |
| Auth | `POST /api/public/auth/login` → `resp.usuario.token` |
| Módulo UI | **NO disponible en UI de vec-dev** — validación solo API |
| Gerenciador test | ID=1 (TALLER TEMPLATE #01) |

## Payload mínimo para crear factura

```json
{
  "gerenciador": {"id": 1},
  "tipo": "A",
  "puntoDeVenta": "0099",
  "numero": "XXXXX",
  "fecha": "2026-05-27",
  "quincena": {"id": 1},
  "mes": {"id": 5},
  "anio": 2026,
  "importe": 1000,
  "selectedTickets": []
}
```

**Nota:** `tipo` debe ser no-vacío para que se active la validación de unicidad en el `create`. Sin `tipo` no hay check de duplicados.

## Flujo del escenario de bug (CA1)

```
POST /api/facturas {datos}           → factura A (PREFACTURADA)
POST /api/facturas/{idA}/rechazar    → A = RECHAZADA
POST /api/facturas {mismos datos}    → factura B (PREFACTURADA) [A=RECHAZADA → permitido]
POST /api/facturas/{idB}/rechazar    → B = RECHAZADA [era el bug: ahora funciona]
```

## Casos de prueba

| CA | Tipo | Descripción | Request | Esperado |
|---|---|---|---|---|
| CA1 | API | Rechazar B cuando gemela A ya está RECHAZADA | `POST /facturas/{idB}/rechazar` | 200 sin error |
| CA2 | API | Crear duplicado con gemela en PREFACTURADA | `POST /facturas` mismos datos | 400 `la_factura_existe` |
| CA3 | API | Crear duplicado con gemela en APROBADA | `POST /facturas` mismos datos | 400 `la_factura_existe` |
| CA4 | API | Crear tras rechazar (RECHAZADA libera el slot) | rechazar A → `POST /facturas` mismos datos | 201 |
| CA5 | API | Rechazo normal sin gemela — regresión | `POST /facturas/{id}/rechazar` cualquier factura única | 200 |

## Gotchas críticos

- **UI no disponible en vec-dev**: el módulo de Facturas no es visible en la UI para el tenant de stineo en vec-dev. Validación solo por API.
- **tipo obligatorio para activar check**: si `tipo` es null/vacío, el repositorio omite el bloque de validación de duplicados por completo — el test de CA1/CA2/CA3/CA4 requiere `tipo` con valor.
- **stineo tiene permiso FACTURAS_APROBAR**: se puede aprobar facturas desde vec-dev con stineo para CA3.
- **Estado inicial siempre PREFACTURADA**: el `create` hardcodea `ESTADO_PREFACTURADA` en el INSERT.

## Resultados QA

| CA | Resultado |
|---|---|
| CA1 | ✅ PASS |
| CA2 | ✅ PASS |
| CA3 | ✅ PASS |
| CA4 | ✅ PASS |
| CA5 | ✅ PASS |

**5/5 PASS**

**QA Report:** VEC-3229 (Tarea, label "test", link "Test" a VEC-3182). VEC-3182 → Finalizada.

→ Ver conocimiento del módulo en [[module-facturacion]]
