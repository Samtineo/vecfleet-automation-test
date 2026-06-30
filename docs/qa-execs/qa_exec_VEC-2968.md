---
name: qa-exec-vec-2968
description: QA exec de VEC-2968 — fix NULL constraint en movil_km_diario al crear movil sin km_actual
metadata: 
  node_type: memory
  type: project
  originSessionId: 128ea87d-6278-46ce-9a4d-ffc471da7f9f
---

## VEC-2968 — createMovilKmDiario() NOT NULL fix

**Resultado:** 3/3 PASS. Ambiente: vec-dev. QA Report: **VEC-3199**.

**Fix:** `MovilRepository.php:2738` — `$movil->getKmActual() ?? 0` (antes: `$movil->getKmActual()` podía ser null, violando NOT NULL en `movil_km_diario.kilometros`).

**Why:** Al crear un móvil sin km_actual, el INSERT en movil_km_diario fallaba con `SQLSTATE[23000]`. El catch silenciaba el error y no creaba el registro km_diario.

**How to apply:** Para regresión, crear móvil sin kmActual y verificar km_actual=0 en GET.

---

## Prerequisitos API vec-dev

Payload mínimo requerido (POST /moviles):
```json
{
  "dominio": "XXXX-XX-X",
  "unidad": "string",
  "activo": true,
  "unidadMedidorId": 1,
  "force_avl_odometer": false,
  "sync_avl": false,
  "buscar_infracciones": false,
  "chasis": "string_unico",
  "valorAdquisicion": 0,
  "valorAmortizacion": 0,
  "valorContable": 0,
  "valorAlquiler": 0,
  "valorPoliza": 0,
  "valorFranquicia": 0,
  "pesoCargaTotalAutorizado": 0,
  "pesoCargaMaxima": 0,
  "volumenAreaCarga": 0,
  "cantidadCompartimentos": 0,
  "alturaEspacioCarga": 0,
  "anchoEspacioCarga": 0,
  "longitudEspacioCarga": 0,
  "adjuntos": [],
  "valores_dinamicos": [],
  "activos_asociados_ids": [],
  "transportadora": {"id": 1},
  "transportadoras": [{"id": 1}],
  "guardaEnBase": false
}
```

Configs activas en vec-dev que obligan campos extra:
- `moviles.transportadora.obligatorio = true` → transportadora y transportadoras requeridos
- `moviles.chasis.obligatorio = true` → chasis único requerido
- Campos numéricos dimensión/económicos son NOT NULL en DB → enviar como 0
- `unidadMedidorId` OBLIGATORIO: 1 (odómetro) o 2 (horómetro) — validado estrictamente en repo

**Gotcha:** `force_avl_odometer` es `bool` no-nullable en PHP — debe enviarse explícitamente como `false`.

---

## CAs Ejecutados

| CA | Descripción | Resultado |
|---|---|---|
| CA1 | POST /moviles sin kmActual → km_actual=0 | PASS (movil ID 2339) |
| CA2 | POST /moviles con kmActual=5000 → km_actual=5000 | PASS (movil ID 2340) |
| CA3 | Tests de integración — MovilRepositoryCreateKmDiarioTest | PASS (en código) |

---

## Tests de Integración (en repo)

Archivo: `tests_new/Integration/Repository/MovilRepositoryCreateKmDiarioTest.php`
- `test_crea_registro_con_km_cero_cuando_km_actual_es_null` — assertSame(0.0, float(kilometros))
- `test_crea_registro_con_km_actual_cuando_tiene_valor` — assertEqualsWithDelta(12345.5, float, 0.001)

Comando: `composer test:new:integration -- --filter MovilRepositoryCreateKmDiarioTest`
