# Tickets Predictivos — Alta automática y Motor de Reglas

## 1. ¿Qué hace esta feature?

Genera automáticamente tickets de tipo Predictivo cuando el motor de reglas detecta que un vehículo cumple los criterios de elegibilidad sobre su historial de predicciones. El ticket se crea sin intervención humana y aparece en la grilla estándar de tickets.

Cards de referencia: VEC-2479 (épica), VEC-2629 (visibilidad grilla), VEC-2723 (issues y definición modo histórico)  
Test cases originales: TEST-1465 (motor de reglas), TEST-1500 (tabla histórica), TEST-1503 (E2E web)

---

## 2. Requisitos para que funcione

| Requisito | Detalle |
|---|---|
| `predictivo.habilitado = true` | Habilita el módulo completo. Sin esto el motor no evalúa nada. |
| Servicios de tipo PREDICTIVO | Deben existir servicios con `ticket_tipo = PREDICTIVO` en el entorno |
| Tabla `predictivos_historico` | Debe tener registros para que el motor evalúe |

**Habilitar en DBeaver:**
```sql
UPDATE `vec-dev`.config_business SET valor='true' WHERE seccion='predictivo' AND parametro='habilitado';
```

---

## 3. Endpoints

Base: `https://vec-dev.vecfleet.io/ws/Public/index.php/api`  
Auth header: `Authorization-Token: <token>`

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/predictivo-historicos` | Inserta predicción diaria en la tabla histórica |
| POST | `/crons/evaluacion-predictivos` | Dispara el motor de reglas |
| GET | `/servicios/tipo-ticket/PREDICTIVO/select` | Lista servicios de tipo PREDICTIVO disponibles |

**Payload — ingesta histórica:**
```json
{
    "movil_id": 10,
    "prediction_date": "2026-06-02",
    "prediction_value": true,
    "service_id": 1053
}
```

> ⚠️ El campo es `service_id` (ID entero del servicio de tipo PREDICTIVO). No acepta `service_code` ni nombre.

**Response — motor de reglas:**
```json
{
    "status": 200,
    "data": {
        "mensaje": "Ok",
        "fechaHora": "2026-06-02 14:53:43",
        "prediccionesEvaluadas": 1,
        "candidatosDisparados": 1,
        "ticketsCreados": 1
    }
}
```

---

## 4. Las 3 reglas del motor

Todas deben cumplirse para generar el ticket.

| Regla | Config | Criterio |
|---|---|---|
| R1 — Consecutivos positivos | `predictivo.diasConsecutivosPositivosMinimos` (default 3) | N días con `prediction_value = true` consecutivos para el mismo movil+servicio. Un día negativo rompe la secuencia. |
| R2 — Sin ticket abierto | — | No existe ticket PREDICTIVO del mismo servicio en estado distinto a CERRADO o CANCELADO. |
| R3 — Calmdown post-cierre | `predictivo.diasEnfriamientoPostCierre` (default 7) | Días transcurridos desde cierre o cancelación del último ticket ≥ N. Borde inclusivo: el día exacto ya habilita la generación. |

---

## 5. Casos de prueba

### TC1 — Sin registros previos → no genera ticket
**Datos:** no hay registros en `predictivos_historico` para el movil+servicio  
**Acción:** `POST /crons/evaluacion-predictivos`  
**Resultado esperado:** `prediccionesEvaluadas=0, candidatosDisparados=0, ticketsCreados=0`  
**Estado:** ✅ PASS (TEST-1465 paso 1)

### TC2 — Sin 3 afirmativos consecutivos → no genera
**Datos:** ≥3 registros pero al menos uno con `prediction_value=false` (p.ej.: true, false, true)  
**Acción:** `POST /crons/evaluacion-predictivos`  
**Resultado esperado:** `candidatosDisparados=0, ticketsCreados=0`  
**Estado:** ✅ PASS (TEST-1465 paso 2)

### TC3 — 3 afirmativos + ticket en Estado Pendiente → no genera (R2)
**Datos:** 3 días consecutivos positivos + ticket PREDICTIVO del mismo servicio en estado ABIERTO  
**Acción:** `POST /crons/evaluacion-predictivos`  
**Resultado esperado:** `candidatosDisparados=0, ticketsCreados=0`  
**Estado:** ✅ PASS (TEST-1465 paso 3)

### TC4 — 3 afirmativos + ticket cerrado hace < 7 días → no genera (R3)
**Datos:** 3 días consecutivos positivos + último ticket cerrado hace menos de 7 días  
**Acción:** `POST /crons/evaluacion-predictivos`  
**Resultado esperado:** `candidatosDisparados=0, ticketsCreados=0`  
**Estado:** ✅ PASS (TEST-1465 paso 4)

### TC5 — 3 afirmativos + ticket cerrado hace exactamente 7 días → GENERA (borde R3)
**Datos:** 3 días consecutivos positivos + último ticket cerrado hace exactamente 7 días  
**Acción:** `POST /crons/evaluacion-predictivos`  
**Resultado esperado:** `candidatosDisparados=1, ticketsCreados=1`  
**Verificar:** ticket creado con tipo=PREDICTIVO, estado=ABIERTO, servicio y movil correctos  
**Estado:** ✅ PASS (TEST-1465 paso 5)

### TC6 — Happy path: 3 afirmativos, sin ticket previo → GENERA
**Datos:** 3 días consecutivos positivos, sin ticket PREDICTIVO abierto ni cierre reciente  
**Acción:** `POST /crons/evaluacion-predictivos`  
**Resultado esperado:** `candidatosDisparados=1, ticketsCreados=1`  
**Estado:** ✅ PASS (TEST-1465 / TEST-1503)

### TC7 — Sin parámetros en config → defaults aplicados
**Datos:** eliminar `diasEnfriamientoPostCierre` y `diasConsecutivosPositivosMinimos` del config-business + condiciones de TC6  
**Acción:** `POST /crons/evaluacion-predictivos`  
**Resultado esperado:** `ticketsCreados=1` (sistema toma defaults: 3 días, 7 días calmdown)  
**Estado:** ✅ PASS (TEST-1465 paso 6)

### TC8 — Ingesta: POST con payload válido
**Acción:** `POST /predictivo-historicos` con movil, fecha, valor y service_id de tipo PREDICTIVO  
**Resultado esperado:** HTTP 200, registro persistido en DB con `id` asignado  
**Estado:** ✅ PASS (TEST-1500 paso 2)

### TC9 — Ingesta: servicio no predictivo → error
**Acción:** `POST /predictivo-historicos` con `service_id` de tipo CORRECTIVO (ej: ID 5, CERRAJERIA)  
**Resultado esperado:** HTTP 500 "The predictive service does not exist."  
**Estado:** ✅ PASS (validado en vec-dev 2026-06-02)

### TC10 — Tabla histórica: unicidad por día
**Datos:** intentar insertar predicción con mismo movil+servicio+fecha ya existente  
**Resultado esperado:** responde informando duplicado, no rompe, no inserta  
**Estado:** ✅ PASS (TEST-1500 paso 3)

### TC11 — Motor no ejecuta con config deshabilitado
**Datos:** `predictivo.habilitado = false`  
**Acción:** `POST /crons/evaluacion-predictivos`  
**Resultado esperado:** no procesa predicciones (0 evaluadas)  
**Estado:** ✅ PASS (TEST-1503 / validado en vec-dev 2026-06-02)

### TC12 — E2E web: tipo Predictivo visible en filtros y dashboard con config true
**Datos:** `predictivo.habilitado = true`, permisos asignados  
**Resultado esperado:** tipo "Predictivo" aparece en filtros de tickets y en dashboard  
**Estado:** ✅ PASS (TEST-1503 paso 3)

### TC13 — Alta manual imposible
**Acción:** intentar crear ticket de tipo PREDICTIVO manualmente desde Tickets > Nuevo o Mantenimiento  
**Resultado esperado:** no es posible — solo se genera automáticamente  
**Estado:** ✅ PASS (TEST-1503 paso 4)

---

## 6. Data de prueba — vec-dev

| Dato | Valor |
|---|---|
| Servicios PREDICTIVO disponibles | ID 1053 (PREDICTIVO - MOTOR), ID 1062 (PREDICTIVO TEST), ID 1072 (DEFAULT - PREDICTIVO) |
| Móvil de prueba sugerido | Uno sin tickets predictivos abiertos para el servicio elegido |
| Config por defecto | `predictivo.habilitado = false` — recordar revertir tras pruebas |

---

## 7. Gotchas

- **Path del motor:** `/crons/evaluacion-predictivos` (NO `/evaluacion-predictivos`)
- **Endpoint de ingesta:** solo tiene `POST`, no `GET`
- **service_id:** ID entero del servicio de tipo PREDICTIVO — no acepta nombre
- **Errores silenciosos:** el motor no expone el campo `errores` en el response. Si `candidatosDisparados > 0` y `ticketsCreados = 0`, puede haber una excepción en la creación del ticket que queda en el log del servidor
- **Modo histórico:** con `predictivo.habilitado = false`, los tickets y servicios predictivos existentes siguen visibles pero no se pueden crear nuevos ni ejecutar el motor
