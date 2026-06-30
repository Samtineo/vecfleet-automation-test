---
name: qa-exec-vec-3380
description: "QA Exec para VEC-3380 — Facturas: endpoints /aprobar, /rechazar y /pagar retornan 500 (regresión). Entorno vec-dev."
metadata: 
  node_type: memory
  type: project
  originSessionId: 5fffe884-6bb8-4ce8-a2d3-8fdd01073888
---

## Entorno
- URL base: `{{url}}` = vec-dev
- Usuario: stineo / perfil 719
- Token: `POST /public/auth/login` con `usuario`/`clave`. **El token está en `resp.token` (top-level del response), NO en `resp.usuario.token`** (la memoria vieja de VEC-3151 estaba desactualizada en este punto).
- Header de auth: `Authorization-Token: {token}` — **NO `Bearer`**.

## Contexto del bug

Bug de regresión detectado durante el QA de VEC-3151:
- 2026-06-17: primer síntoma del 500 en los endpoints de transición de facturas.
- 2026-06-19: regresión confirmada y abierta como VEC-3380. Asignada a Julian Quino.
- 2026-06-22: re-test post-fix definitivo → 3/3 PASS.

Los endpoints `POST /facturas/{id}/aprobar`, `/rechazar` y `/pagar` retornaban HTTP 500 en cada request, dejando además el historial `facturas_log_estados` vacío (el 500 abortaba antes de la escritura en DB).

## Causa raíz (confirmada en código)

El commit `9bffc8d1c` agregó llamadas a `logEstado()` dentro de los tres handlers de `FacturasController.php` (`/{id}/aprobar`, `/{id}/rechazar`, `/{id}/pagar`) pero **se comió los `return $response->withStatus(200)` de los tres callbacks**. Sin el `return`, Slim respondía HTTP 500 en cada request. El 500 abortaba antes de la escritura en `facturas_log_estados`, dejando el historial vacío.

Detalle relacionado: `setState()` en `FacturasRepository.php` **NO valida estado previo** — hace un UPDATE directo. Por eso cualquier transición exitosa (sea cual sea el estado de origen) devuelve 200; no hay guarda de máquina de estados a nivel repo.

## Fix

Branch `bugfix/VEC-3380`, 3 commits mergeados a develop:

| Commit | Cambio |
|---|---|
| `df633279c` | restore missing `return` en `/aprobar`, `/rechazar` y `/pagar` |
| `418f5cb96` | make `observaciones` params nullable en approve/reject/paid |
| `761933332` | make `setState` `observaciones` nullable; add regression tests |

## Prerrequisitos

1. Verificar estado de las facturas antes de ejecutar (cada transición consume el estado de origen):
   - `/aprobar`: requiere factura PENDIENTE (PREFACTURADA)
   - `/rechazar`: requiere factura PENDIENTE (PREFACTURADA)
   - `/pagar`: requiere factura APROBADA
2. Confirmar con dev (Julian Quino) que los 3 commits de `bugfix/VEC-3380` están desplegados en vec-dev antes de re-testear.
3. Login y extraer token de `resp.token` (top-level). Usar header `Authorization-Token: {token}`.

## Endpoints usados

| Método | Endpoint | Para qué |
|---|---|---|
| POST | `/public/auth/login` | Autenticación. Token en `resp.token` (top-level) |
| POST | `/facturas/{id}/aprobar` | Aprobar factura (transición → APROBADA) |
| POST | `/facturas/{id}/rechazar` | Rechazar factura (transición → RECHAZADA) |
| POST | `/facturas/{id}/pagar` | Pagar factura (transición → PAGADA) |
| GET | `/facturas/{id}/historial-estados` | Verificar registro en facturas_log_estados |

## Casos de prueba (re-test 2026-06-22, vec-dev)

| CA | Escenario | Resultado | Observación |
|---|---|---|---|
| CA01 | POST /facturas/15/aprobar (PENDIENTE→APROBADA) | ✅ PASS | HTTP 200. Historial: estado_anterior=PENDIENTE |
| CA02 | POST /facturas/16/rechazar (PENDIENTE→RECHAZADA) | ✅ PASS | HTTP 200. Historial: estado_anterior=PENDIENTE |
| CA03 | POST /facturas/14/pagar (APROBADA→PAGADA) | ✅ PASS | HTTP 200. Historial: estado_anterior=APROBADA |

**3/3 PASS.** Los tres endpoints devuelven 200 y registran correctamente la entrada en `facturas_log_estados` con `estado_anterior` poblado.

## Gotchas

1. **Header de auth: `Authorization-Token: {token}`, NO `Bearer`.** Usar `Bearer` da error de autenticación.
2. **Token en `resp.token` (top-level)**, no en `resp.usuario.token`. La memoria vieja (VEC-3151) decía `resp.usuario.token` — está desactualizado. Verificar el shape del response del login.
3. **`setState()` no valida estado previo**: hace UPDATE directo en `FacturasRepository.php`. Por eso cualquier transición da 200 sin importar el estado de origen. No esperar un 400 por transición inválida a nivel de estos endpoints.
4. **Patrón de regresión "return comido por deploy"**: este bug nació de un commit que agregó lógica (`logEstado()`) y borró accidentalmente los `return $response->withStatus(200)` de los callbacks. Slim → 500. Ante un 500 inexplicable en un handler que antes funcionaba, revisar si el último deploy tocó el `return` final del callback.
5. **El 500 aborta antes de escribir en DB**: si el endpoint da 500, el historial queda vacío y la factura no cambia de estado. Útil para distinguir "falló todo" de "falló solo la respuesta".
6. **Estado de facturas vec-dev tras este re-test**: factura 15=APROBADA, 16=RECHAZADA, 14=PAGADA. Ya consumidas: NO reutilizar para las mismas transiciones. Buscar otras facturas en el estado de origen requerido antes de re-testear.

## QA Report
VEC-3380 — https://vecfleet-kanban.atlassian.net/browse/VEC-3380
