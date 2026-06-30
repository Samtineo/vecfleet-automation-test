---
name: qa-exec-vec-3249
description: "QA VEC-3249 — Infracciones: nuevo endpoint GET /infracciones/buscar-dominio-o-documento. 8/8 PASS. QA Report: VEC-3260"
metadata: 
  node_type: memory
  type: project
  originSessionId: ae01135e-d1eb-4594-90d4-8d278a96574e
---

## Feature
Nuevo endpoint `GET /api/infracciones/buscar-dominio-o-documento` para que clientes consulten infracciones por dominio del vehículo o documento del conductor. Diseñado para consumo externo (no frontend).

## Endpoint
`GET /api/infracciones/buscar-dominio-o-documento`  
Permiso: `INFRACCIONES_VISUALIZAR`

## Parámetros (query string)

| Parámetro | Tipo | Condición |
|---|---|---|
| `dominio` | string | Condicional — patente del vehículo |
| `nroDocumento` | string | Condicional — número de documento del conductor |
| `tipoDocumento` | string | Obligatorio junto con nroDocumento (ej: "DNI") |

**Reglas:**
- Al menos uno de los dos modos debe enviarse
- Modo 1: solo `dominio`
- Modo 2: `nroDocumento` + `tipoDocumento` (ambos juntos)
- Si se envían dominio + documento, **dominio tiene prioridad**

## Resultados QA — 8/8 PASS

| CA | Escenario | HTTP | Resultado |
|---|---|---|---|
| CA01 | Búsqueda por dominio con infracciones (RHYG-54-K) | 200 | Array de infracciones ✅ |
| CA02 | Búsqueda por nroDocumento=0000000008 + tipoDocumento=DNI | 200 | 3 infracciones ✅ |
| CA03 | nroDocumento sin tipoDocumento | 400 | `tipo_documento_requerido` ✅ |
| CA04 | Dominio válido sin infracciones (TGRC-30) | 200 | `[]` ✅ |
| CA05 | Sin parámetros | 400 | `parametro_requerido` ✅ |
| Extra | Dominio inexistente (XXXXXXXXX) | 404 | `"La entidad 'Movil' con ID XXXXXXXXX no existe."` ✅ |
| Extra | Conductor inexistente (99999999/DNI) | 404 | `"La entidad 'Persona' con nro de documento... no existe."` ✅ |
| Extra | dominio + documento → dominio prioridad | 200 | Infracciones del dominio ✅ |

**QA Report:** [VEC-3260](https://vecfleet-kanban.atlassian.net/browse/VEC-3260)

## Data de prueba — vec-dev

| Dato | Valor |
|---|---|
| Dominio con infracciones | RHYG-54-K (movil ID 2) — infracción ID 8266 |
| Dominio sin infracciones | TGRC-30 (movil ID 6) |
| Conductor con infracciones | Persona 4 (USUARIO DEFAULT), DNI 0000000008 — infracciones 393, 8275, 8295 |
| Endpoint original (no modificado) | `GET /infracciones/dominio/{dominio}` |

## Estructura de respuesta (misma que endpoint original)
```json
[{
  "id", "idMovil", "movil", "fuente", "acta", "fechaEmision", "fechaVencimiento",
  "descripcion", "direccion", "importe", "latitud", "longitud", "conductor",
  "responsable1", "responsable2", "codigoInfraccion", "infraccion",
  "puntosDescontados", "adjuntos", "importeAbonado", "fechaAbono",
  "fechaProceso", "latitud_detectada_avl", "longitud_detectada_avl", "pagada"
}]
```
