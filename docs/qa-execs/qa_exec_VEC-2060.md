---
name: qa-exec-vec-2060
description: QA Exec para VEC-2060 — Ajuste de zona horaria en integración Frotcom – T1 México. Entorno vec-dev.
metadata: 
  node_type: memory
  type: project
  originSessionId: 8bf28f2b-3feb-46fc-aa8b-2f46ff497a9a
---

## Entorno
- URL base: vec-dev
- Entorno de prueba: vec-dev (estándar)
- PR mergeado: #2061 (feature/VEC-2060 → develop, 2026-06-05)
- Archivos modificados en el PR: `FrotcomAvlService.php`, `FrotcomApi.php`, `config-business.php.sample`

## Prerrequisitos

- Config habilitada en config_business:
  - `avl_service.frotcom.utc_offset = "-6"` (México, UTC-6)
  - Verificar con GET /config-business que el valor esté presente
- La cuenta Frotcom asociada a vec-dev corresponde a usuario `jJBN91z8TlwuFF2` (Grupo Modelo México)
- Los móviles configurados en la cuenta Frotcom de prueba no existen en vec-dev; esto hace que los crons devuelvan `movilesNoEncontrados: X` — comportamiento esperado
- No se requieren datos de prueba adicionales; los crons operan sobre todos los móviles con integración AVL activa

## Endpoints usados

| Método | Endpoint | Para qué |
|---|---|---|
| GET | `/config-business` | Verificar que `avl_service.frotcom.utc_offset` esté seteado |
| POST | `/crons/logdistance` | Ejecutar cron de log de distancia (integración Frotcom) |
| POST | `/crons/calculardistancia` | Ejecutar cron de cálculo de distancia |
| POST | `/crons/kmdiario` | Ejecutar cron de km diario |

## Casos de prueba

| CA | Escenario | Resultado | Observacion |
|---|---|---|---|
| G1 | Revision estatica PR: `getFrotcomHorasAUtc()` lee `avl_service.frotcom.utc_offset`; fallback a `query_timezone`; default 0. Con utc_offset="-6": horasAUtc=6 | PASS | Verificado en codigo de FrotcomAvlService.php |
| G2 | Config vec-dev: GET /config-business devuelve `avl_service.frotcom.utc_offset = "-6"` | PASS | Valor correcto para T1 Mexico |
| G3 | Crons responden HTTP 200: logdistance (6 procesados, 6 no encontrados), calculardistancia 200, kmdiario 200. `movilesNoEncontrados=6` es esperado en vec-dev | PASS | Crons operativos post-merge |
| G4 | Logica timestamps (estatico): from_local (UTC-6) + 6h = UTC para Frotcom; final_to usa Carbon::now(UTC-6) | PASS | Verificado en codigo de FrotcomAvlService.php |

## Gotchas

- **API Frotcom no accesible directamente**: las llamadas directas a la API Frotcom desde fuera de la plataforma VEC devuelven 401. La api_key del usuario `jJBN91z8TlwuFF2` (Julian Quino / Grupo Modelo Mexico) expiro o requiere autenticacion desde la plataforma VEC. La verificacion E2E de timestamps reales no es ejecutable desde vec-dev con credenciales de prueba.
- **movilesNoEncontrados es esperado**: en vec-dev los moviles del config Frotcom no coinciden con los de la cuenta de prueba. Ver `movilesNoEncontrados: 6` (o similar) en la respuesta de logdistance no indica error — es el comportamiento correcto de un entorno sin datos reales.
- **Desfase corregido es 6h, no 3h**: antes del fix, FrotcomAvlService enviaba timestamps en UTC-3 (Argentina). Post-fix, convierte UTC-6 (Mexico) a UTC sumando 6h. Al regresar este feature, confirmar que el utc_offset en config_business sea el correcto para el tenant.
- **Fix adicional vehicleDistance()**: ademas del timezone, el PR corrige la suma de trips en `vehicleDistance()`: ahora acumula incrementalmente en lugar de calcular last-first. Ambos fixes van juntos en PR #2061.
- **Config por instancia/tenant**: el valor de utc_offset varia segun el pais del tenant. Referencias: utc_offset="-5" para Honduras, Panama, Ecuador, Colombia, Peru; utc_offset="-4" para Rep. Dominicana; utc_offset="-6" para Mexico.
- **Validacion E2E real requiere staging con vehiculos activos**: para verificar que los timestamps enviados a Frotcom son correctos se necesita un entorno con api_key activa y vehiculos reales reportando datos. No disponible en vec-dev.

## Observaciones

- **OBS-1**: API Frotcom no accesible directamente (401). La verificacion E2E de timestamps no fue ejecutable. La api_key de Julian Quino expiro o requiere autenticacion desde la plataforma VEC. El G3 y G4 fueron validados via revision estatica del codigo y respuesta exitosa de los crons (sin error de integracion).
- **OBS-2**: El desfase corregido es de 6h (no 3h como en el contexto de Argentina). Pre-fix: timestamps en UTC-3; post-fix: convierte UTC-6 a UTC.
- **OBS-3**: Fix adicional en `vehicleDistance()`: suma incremental de trips en lugar de last-first. Mejora la precision del calculo de distancia.

## QA Report
VEC-3357 — https://vecfleet-kanban.atlassian.net/browse/VEC-3357
