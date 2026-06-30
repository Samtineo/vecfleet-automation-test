---
name: qa-exec-predictivos-alta-tickets
description: "TCs para alta automática de tickets predictivos — motor de reglas, ingesta histórica y E2E en vec-dev"
metadata: 
  node_type: memory
  type: project
  originSessionId: ae01135e-d1eb-4594-90d4-8d278a96574e
---

## Feature
Alta automática de tickets de tipo Predictivo mediante el motor de reglas. El ticket se genera cuando se cumplen las 3 reglas de elegibilidad sobre los datos de `predictivos_historico`.

## Dimensión ROP (qué tipo de ticket crea el motor)

El motor tiene **dos paths de creación** según `rop.habilitado` del tenant:

| ROP del tenant | Path en `PredictivoEvaluacionService.php` | Resultado |
|---|---|---|
| OFF | `dispararCreacionTicketPredictivo` | Ticket tipo **PREDICTIVO** |
| ON | `dispararCreacionCorrectivoRopPredictivo` | Ticket **CORRECTIVO** con detalle PREDICTIVO |

- **vec-dev está ROP OFF** → el motor crea PREDICTIVO. Si en una regresión aparece un CORRECTIVO en vez de PREDICTIVO, revisar `rop.habilitado`.
- **VEC-3399** corrigió un bug que afectaba SOLO el path sin-ROP: en `dispararCreacionTicketPredictivo`, el cálculo de centro de costos llamaba a `MovilRepository::get` con la variable equivocada en vez de `$movilId`, lanzaba una excepción capturada en silencio por el catch del motor, y para clientes con ROP OFF nunca se creaba ticket. Fix PR #2108: pasar `$movilId`. Ver `qa_exec_VEC-3399.md`.
- **Verificación siempre por persistencia**, nunca por el 200 del cron: el motor responde 200 aunque la creación interna falle. Contrato: `candidatosDisparados == ticketsCreados`.

## Prerrequisitos

| Item | Valor |
|---|---|
| Config | `predictivo.habilitado = true` en config-business. Habilitar vía DBeaver: `UPDATE \`vec-dev\`.config_business SET valor='true' WHERE seccion='predictivo' AND parametro='habilitado';` |
| Servicios PREDICTIVO en vec-dev | ID 1062 (PREDICTIVO TEST), ID 1072 (DEFAULT - PREDICTIVO). El 1053 ya NO aparece en el select (obsoleto desde VEC-3399) |
| Móvil de prueba sugerido | Usar uno sin tickets predictivos abiertos para el servicio elegido |
| Auth | `POST /public/auth/login` → token |

## Endpoints

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/api/predictivo-historicos` | Inserta predicción diaria en la tabla histórica |
| POST | `/api/crons/evaluacion-predictivos` | Dispara el motor de reglas |
| GET | `/api/servicios/tipo-ticket/PREDICTIVO/select` | Lista servicios de tipo PREDICTIVO disponibles |

## Payload — ingesta histórica

```json
{
    "movil_id": 10,
    "prediction_date": "2026-06-02",
    "prediction_value": true,
    "service_id": 1053
}
```

> ⚠️ El campo es `service_id` (ID entero), NO `service_code` ni nombre del servicio.

## Reglas del motor (las 3 deben cumplirse)

| Regla | Config | Criterio |
|---|---|---|
| R1 — Consecutivos positivos | `predictivo.diasConsecutivosPositivosMinimos` (default 3) | N días con `prediction_value = true` consecutivos para mismo movil+servicio |
| R2 — Sin ticket abierto | — | No existe ticket PREDICTIVO del mismo servicio en estado distinto a CERRADO/CANCELADO |
| R3 — Calmdown | `predictivo.diasEnfriamientoPostCierre` (default 7) | Días transcurridos desde cierre/cancelación del último ticket ≥ N (borde inclusivo) |

## TCs — Motor de reglas

### TC1 — Sin registros previos → no genera ticket
```
Dado: no hay registros en predictivos_historico para el movil+servicio
Cuando: POST /crons/evaluacion-predictivos
Entonces: prediccionesEvaluadas=0, candidatosDisparados=0, ticketsCreados=0
```

### TC2 — 3 registros pero no todos consecutivos positivos → no genera
```
Dado: 3 registros donde al menos uno tiene prediction_value=false (ej: true, false, true)
Cuando: POST /crons/evaluacion-predictivos
Entonces: prediccionesEvaluadas=1, candidatosDisparados=0, ticketsCreados=0
```

### TC3 — 3 positivos consecutivos + ticket pendiente → no genera (R2 bloquea)
```
Dado: 3 días consecutivos positivos
      existe ticket PREDICTIVO del mismo servicio en estado ABIERTO/EN_REPARACION/etc.
Cuando: POST /crons/evaluacion-predictivos
Entonces: prediccionesEvaluadas=1, candidatosDisparados=0, ticketsCreados=0
```

### TC4 — 3 positivos consecutivos + ticket cerrado hace < N días → no genera (R3 bloquea)
```
Dado: 3 días consecutivos positivos
      último ticket PREDICTIVO del servicio cerrado hace menos de 7 días
Cuando: POST /crons/evaluacion-predictivos
Entonces: prediccionesEvaluadas=1, candidatosDisparados=0, ticketsCreados=0
```

### TC5 — 3 positivos consecutivos + ticket cerrado hace = 7 días → GENERA ticket (borde R3)
```
Dado: 3 días consecutivos positivos
      último ticket PREDICTIVO del servicio cerrado hace exactamente 7 días
Cuando: POST /crons/evaluacion-predictivos
Entonces: prediccionesEvaluadas=1, candidatosDisparados=1, ticketsCreados=1
```
**Verificar:** ticket creado en grilla con tipo PREDICTIVO, servicio correcto, movil correcto, estado ABIERTO.

### TC6 — Happy path: 3 positivos, sin ticket previo → GENERA ticket
```
Dado: 3 días consecutivos positivos (prediction_value=true)
      sin ticket PREDICTIVO abierto ni cerrado recientemente para ese movil+servicio
Cuando: POST /crons/evaluacion-predictivos
Entonces: prediccionesEvaluadas=1, candidatosDisparados=1, ticketsCreados=1
```
**Verificar en grilla:** tipo=PREDICTIVO, estado=ABIERTO, visibilidad en filtros y dashboard.

### TC7 — Valores default de config (sin parámetros en DB)
```
Dado: eliminar diasEnfriamientoPostCierre y diasConsecutivosPositivosMinimos del config-business
      condiciones equivalentes a TC6
Cuando: POST /crons/evaluacion-predictivos
Entonces: ticketsCreados=1 (sistema toma defaults: 3 días consecutivos, 7 días calmdown)
```

## TCs — Endpoint de ingesta

### TC8 — POST con payload válido
```
POST /api/predictivo-historicos
{ "movil_id": X, "prediction_date": "YYYY-MM-DD", "prediction_value": true, "service_id": 1053 }
Entonces: HTTP 200, registro en DB con id asignado
```

### TC9 — POST con servicio no predictivo → error
```
POST /api/predictivo-historicos
{ "movil_id": X, "prediction_date": "YYYY-MM-DD", "prediction_value": true, "service_id": 5 }
(service_id 5 = CERRAJERIA, tipo CORRECTIVO)
Entonces: HTTP 500 "The predictive service does not exist."
```

### TC10 — POST con movil inexistente → error
```
POST /api/predictivo-historicos
{ "movil_id": 99999, "prediction_date": "YYYY-MM-DD", "prediction_value": true, "service_id": 1053 }
Entonces: error de validación
```

### TC11 — POST duplicado (mismo movil+servicio+fecha) → ignorado
```
Dado: ya existe registro para movil_id=X + service_id=Y + prediction_date=Z
Cuando: POST con mismos datos
Entonces: responde informando duplicado, no rompe
```

## TCs — Config deshabilitada

### TC12 — Motor no ejecuta con config deshabilitado
```
Dado: predictivo.habilitado = false
Cuando: POST /crons/evaluacion-predictivos
Entonces: responde sin procesar predicciones (0 evaluadas)
```

### TC13 — Grilla no muestra tipo PREDICTIVO cuando config = false
```
Dado: predictivo.habilitado = false
Cuando: usuario abre grilla de tickets
Entonces: no aparece opción PREDICTIVO en filtros ni dashboard
```

## Setup de prueba en vec-dev

```sql
-- 1. Habilitar config
UPDATE `vec-dev`.config_business SET valor='true' WHERE seccion='predictivo' AND parametro='habilitado';

-- 2. Limpiar historial del movil de prueba (si hay datos residuales)
DELETE FROM `vec-dev`.predictivos_historico WHERE movil_id=X AND servicio_id=Y;

-- 3. Insertar 3 días consecutivos positivos (via API, no SQL)
POST /api/predictivo-historicos × 3 con fechas consecutivas
```

## Gotchas técnicos

- **Path correcto del motor:** `/api/crons/evaluacion-predictivos` (NO `/api/evaluacion-predictivos`)
- **Path correcto de ingesta:** `/api/predictivo-historicos` (solo POST, no GET)
- **service_id:** ID entero del servicio de tipo PREDICTIVO — no acepta service_code ni nombre
- **JSON parsing:** El endpoint de ingesta puede tener el mismo issue que otros endpoints (body no parseado por middleware de validación) — si falla con JSON, usar form-urlencoded
- **errores silenciosos:** el motor NO expone el campo `errores` en el response — si `candidatosDisparados > 0` y `ticketsCreados = 0`, puede haber una excepción silenciosa en la creación (loggear en servidor)
- **Config en vec-dev:** por defecto `predictivo.habilitado = false`. Recordar revertir después de cada sesión de prueba si es necesario
