---
name: qa-exec-vec-3151
description: "QA Exec para VEC-3151 — Facturas: historial completo de cambios de estado. Entorno vec-dev."
metadata: 
  node_type: memory
  type: project
  originSessionId: 8bf28f2b-3feb-46fc-aa8b-2f46ff497a9a
---

## Entorno
- URL base: `{{url}}` = vec-dev
- Usuario: stineo / perfil 719
- Token: `POST /public/auth/login` con `usuario`/`clave`. **CORRECCIÓN (VEC-3380): el token está en `resp.token` (top-level), NO en `resp.usuario.token`. Header de auth: `Authorization-Token: {token}`, NO Bearer.**

## Contexto del feature

Extiende VEC-3081. Antes solo se registraban las transiciones a PAGADA y CERRADA. A partir de VEC-3151:

- Se agrega columna `estado_anterior` a la tabla `facturas_log_estados`
- Se expone `GET /api/facturas/{id}/historial-estados`
- Se agrega botón "Histórico de Estados" en UI (vistas VIEW y EDIT)
- Se registran todas las transiciones: aprobar, rechazar, pagar, cerrar

## Prerrequisitos

1. Verificar estado actual de las facturas de prueba antes de ejecutar:
   - Factura 7: debe estar CERRADA (no se modifica en estos CAs)
   - Factura 20: debe estar PREFACTURADA (no se pudo aprobar en la sesión de VEC-3151 por bug)
   - Facturas 10, 26, 28: deben tener al menos 2 registros en historial (validado en CA09)
2. Para CA10-CA12 (re-test post-fix): necesitar una factura en estado correcto para cada transicion:
   - /aprobar: requiere factura PREFACTURADA
   - /rechazar: requiere factura APROBADA o PREFACTURADA (confirmar con dev)
   - /pagar: requiere factura APROBADA
3. Confirmar con dev (Julian Quino) que el fix del 500 fue desplegado antes de ejecutar CA10-CA12

## Endpoints usados

| Metodo | Endpoint | Para que |
|---|---|---|
| GET | `/facturas/{id}/historial-estados` | Obtener historial de cambios de estado |
| POST | `/facturas/{id}/aprobar` | Aprobar factura (CA10 — BUG en deploy VEC-3151) |
| POST | `/facturas/{id}/rechazar` | Rechazar factura (CA11 — BUG en deploy VEC-3151) |
| POST | `/facturas/{id}/pagar` | Pagar factura (CA12 — BUG en deploy VEC-3151) |

## Casos de prueba

| CA | Escenario | Resultado | Observacion |
|---|---|---|---|
| CA01 | GET /facturas/{id}/historial-estados responde | PASS | HTTP 200, retorna array |
| CA02 | Estructura response completa | PASS | Campos: estado_anterior, estado, observaciones, created_at, usuario_nombre_apellido |
| CA03 | Orden mas reciente primero | PASS | Confirmado en factura 7 (CERRADA) |
| CA04 | Historial vacio retorna array vacio | PASS | Factura 20 PREFACTURADA sin registros → [] |
| CA05 | Autenticacion requerida | PASS | Sin token → login.errors.invalido |
| CA06 | ID inexistente retorna [] sin error | PASS | /facturas/99999/historial-estados → 200 + [] |
| CA07 | Metodo POST invalido → 404 | PASS | "Servicio no encontrado" |
| CA08 | Registros pre-deploy tienen estado_anterior=null | PASS | Sin backfill por diseno — comportamiento correcto |
| CA09 | Multiples registros en historial | PASS | Facturas 10, 26, 28 tienen 2 registros cada una |
| CA10 | POST /facturas/21/aprobar registra historial | PASS | HTTP 200. estado_anterior: "PREFACTURADA". Factura 21 → APROBADA. Fix Julian Quino 2026-06-19. |
| CA11 | POST /facturas/23/rechazar registra historial | PASS | HTTP 200. estado_anterior: "PREFACTURADA". Factura 23 → RECHAZADA. Fix Julian Quino 2026-06-19. |
| CA12 | POST /facturas/13/pagar registra historial | PASS | HTTP 200. estado_anterior: "APROBADA". Factura 13 → PAGADA. Fix Julian Quino 2026-06-19. |

## Historial del bug CA10-CA12 (RESUELTO — ver VEC-3380)

- 2026-06-16 (ejecucion original): CA10/CA11/CA12 en FAIL. HTTP 500 en /aprobar, /rechazar y /pagar.
- 2026-06-17 (re-test 1): /rechazar paso a PASS. /aprobar sigue con 500. /pagar bloqueado sin APROBADA disponible.
- 2026-06-19 (re-test mañana): /rechazar regresiono con nuevo deploy. Los tres en FAIL.
- 2026-06-19 (dos ciclos post-fix Julian): los tres siguen en 500. Se descarto observacionesCambioEstado como causa.
- 2026-06-19 (registro "12/12 PASS"): se anoto 12/12 PASS en esta fecha, PERO la regresion del 500 reaparecio y quedo documentada como **VEC-3380**. Es decir, el "12/12 PASS del 2026-06-19" es ANTERIOR a la regresion que VEC-3380 documenta — no debe tomarse como cierre definitivo del bug.
- 2026-06-22 (fix definitivo VEC-3380, reconfirmado): 12/12 reconfirmado. La causa raiz se identifico en codigo (no era la logica de insercion como se penso): el commit `9bffc8d1c` se comio los `return $response->withStatus(200)` de los tres handlers → Slim respondia 500. Fix en branch `bugfix/VEC-3380` (commits df633279c / 418f5cb96 / 761933332). **VEC-3151 queda desbloqueada y finalizada.** Ver [[qa-exec-VEC-3380]].

Causa raiz (confirmada en codigo en VEC-3380): `return $response->withStatus(200)` faltante en los handlers de /aprobar, /rechazar y /pagar tras el commit 9bffc8d1c. El campo observacionesCambioEstado NO era la causa — el 500 se reproducia con y sin el campo. El 500 abortaba antes de cualquier escritura en DB (las facturas no cambiaban de estado, el historial quedaba vacio).

## Gotchas

1. **Estado de facturas de prueba post-ciclo**: factura 21 quedo en APROBADA, factura 23 en RECHAZADA, factura 13 en PAGADA. Para futuros re-tests usar otras facturas en PREFACTURADA o APROBADA — verificar estado antes de ejecutar.
2. **Factura 20 ya esta RECHAZADA**: fue rechazada en el re-test de CA11 del 2026-06-17. No reutilizar para /aprobar.
3. **El entorno vec-dev puede sufrir regresiones entre deploys**: CA11 estuvo PASS el 2026-06-17 y regresiono el 2026-06-19 con un nuevo deploy. Siempre verificar estado de las facturas antes de ejecutar CAs de transicion.
4. **El campo observacionesCambioEstado NO es la causa del 500 (descartado)**: el error se reproducia con y sin el campo. El bug era en la logica de insercion en facturas_log_estados.
5. **ID inexistente retorna 200 + []**: comportamiento OBS-01. GET /facturas/99999/historial-estados → HTTP 200 con []. No es un error — es consistente con el patron del modulo.
6. **estado_anterior null en registros viejos**: esperado y correcto. No hay backfill. Solo los registros generados post-deploy VEC-3151 tendran estado_anterior poblado.
7. **Timestamps en UTC**: created_at viene en UTC. Para validar cronologia en ART restar 3 horas. Ver qa_technique_timezone.md.
8. **Response siempre array**: incluso con 1 registro, la response es un array. No un objeto. (OBS-02)

## QA Report
VEC-3151 — https://vecfleet-kanban.atlassian.net/browse/VEC-3151
