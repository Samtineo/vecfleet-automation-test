---
name: VEC-3081 — QA Facturación estado CERRADA
description: Estado del QA de VEC-3081, resultados por CA, bug CA8 pendiente de fix y re-ejecución
type: project
originSessionId: 18b02c56-8497-4abb-bbe5-7451c2b91531
---
Feature: estado `CERRADA` como etapa final opcional del flujo de facturación (`POST /facturas/{id}/cerrar`).

**Estado QA:** Cerrado — 8/9 PASS. CA8 es deuda técnica conocida, sin ETA. VEC-3081 → Finalizada. QA Report: VEC-3165.

## Resultados

| CA | Descripción | Resultado |
|---|---|---|
| CA1 | Cerrar factura PAGADA con requisitos completos | ✅ PASS |
| CA2 | Config deshabilitada → 400 `cerrar_no_habilitado` | ✅ PASS |
| CA3 | Factura en estado APROBADA → 400 `no_se_puede_cerrar_estado_invalido` | ✅ PASS |
| CA4 | Estado CERRADA visible en detalle y grid | ✅ PASS |
| CA5 | Flujo normal no se altera con config off | ✅ PASS |
| CA6 | Adjunto con categoría incorrecta → 400 `adjunto_requerido_para_cerrar` | ✅ PASS |
| CA7 | Sin adjunto → 400 `adjunto_requerido_para_cerrar` | ✅ PASS |
| CA8 | Usuario sin `FACTURAS_CERRAR` → debe ser 403 | ❌ FALLO — retorna 200 `[]` |
| CA9 | Flujo completo correcto → `"Factura cerrada correctamente"` | ✅ PASS |

## Bug CA8

- Endpoint retorna HTTP 200 `[]` para usuarios sin permiso `FACTURAS_CERRAR`
- Factura no cambia de estado (efecto silencioso)
- Reportado como comentario en VEC-3081 (comment ID 133531, 2026-05-11)
- Pendiente: fix del dev → re-ejecutar CA8 → publicar QA Report

## Estado final

- QA Report: VEC-3165 (Tarea, label "test", link "Test" a VEC-3081)
- VEC-3081 → Finalizada (2026-05-11)
- CA8 documentado como fallo conocido / deuda técnica — bug reportado como comentario en VEC-3081 (comment ID 133531)

## Config vec-dev

- `facturas.cambiosEstados.CERRAR.habilitado = true` (casing importante — mayúsculas)
- `facturas.cambiosEstados.CERRAR.categoria = 9` (categoría "TEST")
- Factura de prueba: ID 7 (estado CERRADA tras CA1/CA9)
- Usuario con permiso: USUARIOTEST perfil 736
- Usuario sin permiso: stineo perfil 719, USUARIOTEST perfil 735

**Why:** QA iniciado 2026-05-11. No publicar reporte hasta re-ejecutar CA8.

**How to apply:** Cuando el usuario retome VEC-3081, ir directo a re-ejecutar CA8 y luego publicar el reporte completo.
