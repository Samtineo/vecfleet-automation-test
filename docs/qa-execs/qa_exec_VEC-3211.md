---
name: qa-exec-vec-3211
description: "QA Exec VEC-3211: Llantas Duplicidad en Submódulo Asignaciones. 4/4 PASS. Fix SQL JOIN. QA Report: VEC-3356"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0684b29a-fc0e-42ae-aca1-ddd8cc742e01
---

# QA Exec — VEC-3211 Llantas | Duplicidad en Submódulo de Asignaciones

**Bug:** `GET /llantas/llantasdemovil/{movilId}` multiplicaba filas devueltas por la cantidad de inspecciones del móvil. SQL JOIN entre asignaciones e inspecciones generaba N filas por asignación donde N = cantidad de inspecciones.

**Fix:** El endpoint ahora devuelve 1 fila por llanta asignada, independiente del número de inspecciones.

**Resultado:** 4/4 PASS

**Entorno:** vec-dev (`https://vec-dev.vecfleet.io/ws/Public/index.php/api`)

**Auth:** `Authorization-Token: {token}` (NO Bearer)

---

## Datos de prueba

- Móvil: ID 42, NYC8912
- Llanta: ID 13, posición 1, estado MONTADA, psi=100, recapadas=0
- Puntos de medición: ID 1 y ID 2 (punto_dinamico_id 1 y 2)
- persona_id stineo: 27
- Inspecciones creadas: ID 34 (odometro=1001), ID 35 (odometro=1002)

---

## Test Cases

| CA | Descripción | Resultado |
|---|---|---|
| CA1 | Baseline: móvil 42 con 1 llanta, 0 inspecciones → GET /llantasdemovil/42 devuelve 1 registro | PASS |
| CA2 | POST inspección #1 (ID 34, odometro=1001) → GET /llantasdemovil/42 sigue devolviendo 1 registro | PASS |
| CA3 | POST inspección #2 (ID 35, odometro=1002) → GET sigue devolviendo 1 registro con 2 inspecciones creadas | PASS |
| CA4 | Integridad de datos: registro tiene id=13, posicion=1, estado=MONTADA | PASS |

---

## Payload POST /llantainspecciones (referencia regresión)

```json
{
  "activo": 1,
  "firma": "",
  "firmaURL": "",
  "latitudForm": null,
  "longitudForm": null,
  "llantaMediciones": [{
    "llanta_id": 13,
    "posicion": 1,
    "psi": 100,
    "recapadas": 0,
    "valoresMedidos": {
      "0": {"id": 1, "punto_dinamico_id": 1, "valor": 8},
      "1": {"id": 2, "punto_dinamico_id": 2, "valor": 8}
    }
  }],
  "movil": {"value": 42, "label": "NYC8912", "dominio": "NYC8912"},
  "odometro": 1001,
  "persona_id": 27
}
```

---

## Gotchas

- No hay smoke test previo de llantas — este es el primero. Ver [[module-llantas]] para endpoints.
- Verificar siempre con un móvil que ya tenga llanta asignada (no todos tienen). Alternativa: asignar llanta antes del test.
- Odómetro es secuencial y no puede retroceder — usar valores crecientes entre tests de una misma sesión.
