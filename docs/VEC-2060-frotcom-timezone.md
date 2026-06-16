# Frotcom — Ajuste de zona horaria por tenant (VEC-2060)

## 1. ¿Qué hace esta feature?

Corrige el cálculo de timestamps en la integración con Frotcom AVL para soportar tenants en distintas zonas horarias. Antes del fix, `FrotcomAvlService.php` usaba siempre UTC-3 (Argentina). Post-fix, lee `avl_service.frotcom.utc_offset` de config_business y convierte correctamente la hora local del tenant a UTC antes de enviarla a la API de Frotcom.

**Fix incluido en el mismo PR:** `vehicleDistance()` también fue corregido para acumular trips incrementalmente en lugar de calcular `last - first`, mejorando la precisión del cálculo de distancia.

**PR mergeado:** #2061 (feature/VEC-2060 → develop, 2026-06-05)  
**Archivos modificados:** `FrotcomAvlService.php`, `FrotcomApi.php`, `config-business.php.sample`

---

## 2. Requisitos

### Config obligatoria en config_business

| Parámetro | Tipo | Descripción |
|---|---|---|
| `avl_service.frotcom.utc_offset` | string | Offset UTC del tenant (ej. `"-6"` para México). Fallback a `query_timezone`; default `0` si ninguno existe. |

**Valores de referencia por país:**

| País | utc_offset |
|---|---|
| México | `"-6"` |
| Honduras, Panamá, Ecuador, Colombia, Perú | `"-5"` |
| Rep. Dominicana | `"-4"` |
| Argentina | `"-3"` |

### Verificación previa
```
GET /commons/config-business
Authorization-Token: <token>
```
Confirmar que `avl_service.frotcom.utc_offset` existe y tiene el valor correcto para el tenant.

---

## 3. Endpoints

Base: `https://vec-dev.vecfleet.io/ws/Public/index.php/api`  
Auth header: `Authorization-Token: <token>`

| Método | Endpoint | Para qué |
|---|---|---|
| GET | `/commons/config-business` | Verificar valor de `avl_service.frotcom.utc_offset` |
| POST | `/crons/logdistance` | Ejecutar cron de log de distancia (integración Frotcom) |
| POST | `/crons/calculardistancia` | Ejecutar cron de cálculo de distancia |
| POST | `/crons/kmdiario` | Ejecutar cron de km diario |

### Payloads y respuestas de los crons

Los tres endpoints POST no requieren body. Respuesta esperada HTTP 200:

**POST /crons/logdistance — ejemplo vec-dev:**
```json
{
  "procesados": 6,
  "movilesNoEncontrados": 6,
  "errores": []
}
```

**POST /crons/calculardistancia — ejemplo vec-dev:**
```json
{
  "status": "ok"
}
```

**POST /crons/kmdiario — ejemplo vec-dev:**
```json
{
  "status": "ok"
}
```

---

## 4. Lógica del fix (referencia estática)

```php
// FrotcomAvlService.php — getFrotcomHorasAUtc()
$utcOffset = $configBusiness->avl_service->frotcom->utc_offset
    ?? $configBusiness->query_timezone
    ?? 0;
$horasAUtc = abs((int) $utcOffset); // "-6" → 6

// Conversión de timestamp local a UTC para Frotcom:
// from_local (UTC-6) + 6h = UTC
// to_local: Carbon::now(UTC-6) + 6h = Carbon::now(UTC)
```

---

## 5. Casos de prueba

| CA | Escenario | Resultado esperado | Notas |
|---|---|---|---|
| G1 | Revisión estática: `getFrotcomHorasAUtc()` lee `avl_service.frotcom.utc_offset`, fallback a `query_timezone`, default 0 | Lógica correcta en código | Verificar en `FrotcomAvlService.php` |
| G2 | GET /commons/config-business devuelve `avl_service.frotcom.utc_offset = "-6"` | HTTP 200, valor presente | Para vec-dev (T1 México) |
| G3 | POST /crons/logdistance → HTTP 200 | HTTP 200, cron ejecutado | `movilesNoEncontrados > 0` es esperado en vec-dev |
| G3 | POST /crons/calculardistancia → HTTP 200 | HTTP 200 | Cron operativo |
| G3 | POST /crons/kmdiario → HTTP 200 | HTTP 200 | Cron operativo |
| G4 | Lógica timestamps (estático): from_local (UTC-6) + 6h = UTC; final_to usa Carbon::now(UTC-6) | Conversión correcta en código | Verificar en `FrotcomAvlService.php` |

**Nota importante:** La cobertura E2E de timestamps no es ejecutable en vec-dev. La cuenta Frotcom asociada (`jJBN91z8TlwuFF2`, Grupo Modelo México) no tiene vehículos activos reportando datos en el entorno de prueba. La validación fue estática sobre PR #2061. Para verificación completa se requiere staging con api_key activa y vehículos reales.

---

## 6. Data de prueba — vec-dev

| Dato | Valor |
|---|---|
| Tenant configurado | T1 México (Grupo Modelo) |
| Usuario Frotcom de prueba | `jJBN91z8TlwuFF2` (Julian Quino) |
| utc_offset configurado en vec-dev | `"-6"` |
| Móviles Frotcom en vec-dev | No coinciden con la cuenta de prueba → `movilesNoEncontrados: 6` (esperado) |

---

## 7. Gotchas

- **API Frotcom no accesible directamente**: las llamadas directas a la API Frotcom desde fuera de la plataforma devuelven 401. La api_key del usuario de prueba expiró o requiere autenticación desde la plataforma VEC. La verificación E2E de timestamps reales no es ejecutable desde vec-dev con credenciales de prueba.
- **`movilesNoEncontrados > 0` es comportamiento correcto**: en vec-dev los móviles del config Frotcom no coinciden con los de la cuenta de prueba. Ver `movilesNoEncontrados: 6` en la respuesta de logdistance no es un error.
- **El offset es 6h, no 3h**: el fix corrige para México (UTC-6). Al regresar en otro tenant, confirmar que `avl_service.frotcom.utc_offset` tenga el valor correcto para ese país (ver tabla sección 2).
- **Dos fixes en el mismo PR**: además del timezone, el PR corrige `vehicleDistance()` para acumular trips incrementalmente. Ambos fixes van juntos.
- **Cobertura E2E limitada**: para verificar que los timestamps enviados a Frotcom son correctos se necesita un entorno con api_key activa y vehículos reales reportando datos. No disponible en vec-dev.

---

## 8. Resultados QA

| CA | Resultado | Fecha |
|---|---|---|
| G1 | ✅ PASS (revisión estática) | 2026-06-10 |
| G2 | ✅ PASS | 2026-06-10 |
| G3 (logdistance) | ✅ PASS | 2026-06-10 |
| G3 (calculardistancia) | ✅ PASS | 2026-06-10 |
| G3 (kmdiario) | ✅ PASS | 2026-06-10 |
| G4 | ✅ PASS (revisión estática) | 2026-06-10 |

**QA Report:** VEC-3357 — https://vecfleet-kanban.atlassian.net/browse/VEC-3357
