---
name: qa-exec-VEC-3424
description: "QA Exec para VEC-3424 Bug/Fix Firebase Service Worker en Producción (push/FCM). PASS code-verified + smoke vec-dev. Entorno vec-dev (prod fuera de límites)."
metadata:
  node_type: memory
  type: project
---

# VEC-3424 — Bug/Fix: Firebase Service Worker en Producción

## Resumen
- **Card:** VEC-3424, tipo Historia. **Módulo:** Notificaciones (push / Firebase Cloud Messaging Service Worker).
- **Bug:** al desplegar push en PRODUCCIÓN (VEC), el Service Worker fallaba a registrarse con el error `unsupported MIME type ('text/html')`. Doble falla de enrutamiento:
  1. Frontend con la ruta del SW **hardcodeada** (`/api/public/push/firebase-sw.js`).
  2. Backend con prefijo `/api` **duplicado** por el BasePath de Slim (`/api/api/...`) en prod, más bloqueo del **middleware de sesión** (401) sobre una ruta que debe ser pública.
  El navegador recibía el fallback HTML de la SPA en vez del JS, por eso el MIME `text/html`.
- **Resultado:** **PASS** (verificado por código + smoke no destructivo en vec-dev).
- **Entorno de ejecución:** vec-dev — `https://vec-dev.vecfleet.io/ws/Public/index.php/api`. **Producción fuera de límites por regla crítica de no testear en prod.**
- **Dev:** Ayrton Ortega.

## Entorno
- Base vec-dev: `https://vec-dev.vecfleet.io/ws/Public/index.php/api`.
- Endpoint público del SW (no requiere auth): `GET /public/push/firebase-sw.js`.
- No requiere config de `config_business` para el smoke (es ruteo + headers HTTP del endpoint estático servido por el controller).

## Prerrequisitos
- Ninguno para el smoke público: el endpoint del Service Worker es público (sin token).
- Para reproducir el flujo completo de push (alta de token FCM en frontend) se requiere navegador con permisos de notificación, pero el núcleo del fix (MIME + ruta dinámica) se valida con un GET público + verificación de código.

## Endpoints usados
| Método | Endpoint | Para qué |
|---|---|---|
| GET | `/public/push/firebase-sw.js` (vía `/ws/Public/index.php/api`) | Servir el Service Worker de Firebase con MIME correcto (ruta nueva, dinámica) |
| GET | `/api/public/push/firebase-sw.js` | Ruta vieja hardcodeada — usada solo para reproducir el síntoma original (devuelve HTML) |

Variantes de ruta registradas directo sobre la app en el backend (para tolerar el ruteo de prod):
- `/public/push/firebase-sw.js`
- `/api/public/push/firebase-sw.js`
- `/ws/Public/index.php/api/public/push/firebase-sw.js`

## Casos de prueba

| CA | Escenario | Resultado | Observación |
|---|---|---|---|
| 01 | Frontend usa ruta dinámica vía `getApiBase()` en vez de hardcodeada | ✅ Code-verified | `FcmTokenService.js:99` |
| 02 | Backend registra el SW directo sobre la app con 3 variantes de ruta | ✅ Code-verified | `NotificacionesController.php:108-110` |
| 03 | Handler del SW devuelve headers MIME correctos | ✅ Code-verified | `NotificacionesController.php:102-105` |
| 04 | Grupo de notificaciones duplicado sin `/api` doble en grupo privado | ✅ Code-verified | `NotificacionesController.php:212-213` |
| 05 | Smoke: ruta nueva devuelve JS real con MIME `application/javascript` | ✅ PASS | GET 200 en vec-dev, ver Smoke |
| 06 | Smoke: ruta vieja reproduce síntoma original (HTML) | ✅ PASS (reproduce bug) | Confirma necesidad del fix frontend |

## Verificación por código (ambos fixes presentes)
- **Frontend** `vec-fleet-web/src/commons/firebase/FcmTokenService.js:99`:
  `navigator.serviceWorker.register(getApiBase() + '/public/push/firebase-sw.js')` — ruta dinámica, ya no hardcodeada. ✅
- **Backend** `vec-fleet-api/Controller/NotificacionesController.php`:
  - **L108-110:** SW registrado directo sobre `$this->app` con 3 variantes de ruta (`/public/push/firebase-sw.js`, `/api/public/push/firebase-sw.js`, `/ws/Public/index.php/api/public/push/firebase-sw.js`). ✅
  - **L102-105:** handler con `Content-Type: application/javascript; charset=utf-8`, `Service-Worker-Allowed: /`, `Cache-Control: no-cache, no-store`. ✅
  - **L212-213:** grupo de notificaciones duplicado `/notificaciones` + `/api/notificaciones` (sin `/api` duplicado en el grupo privado). ✅

## Smoke en vec-dev (2026-06-30, no destructivo, GET público)
1. `GET https://vec-dev.vecfleet.io/ws/Public/index.php/api/public/push/firebase-sw.js`
   → **HTTP 200**, `Content-Type: application/javascript; charset=utf-8`, headers `Service-Worker-Allowed: /` y `Cache-Control: no-cache, no-store`, body = `importScripts('...firebase-app-compat.js')...` (JS real). ✅
2. `GET https://vec-dev.vecfleet.io/api/public/push/firebase-sw.js` (ruta vieja hardcodeada)
   → **HTTP 200** pero `Content-Type: text/html` (reproduce el síntoma original: HTML por fallback de la SPA → error MIME). Confirma por qué el fix frontend (`getApiBase`) es necesario. ✅

## Gotchas
- **El error `unsupported MIME type ('text/html')` NO es un problema de Firebase ni del JS del SW**: es un síntoma de ruteo. El servidor devuelve el HTML de la SPA (fallback de ruta no resuelta) en vez del archivo JS, y el navegador rechaza el SW porque exige MIME `application/javascript`. Si ves ese error, revisá primero la ruta y el ruteo, no el contenido del SW.
- **La ruta del SW debe construirse con `getApiBase()`**, nunca hardcodeada con `/api`. El prefijo real varía por entorno (en prod el BasePath de Slim puede duplicar `/api`).
- **El SW se registra directo sobre `$this->app` con 3 variantes de ruta** a propósito, para tolerar las distintas formas en que el reverse proxy / BasePath resuelve la URL entre entornos. No es redundancia accidental.
- **El endpoint del SW debe ser público** (sin pasar por el middleware de sesión); en prod un 401 del middleware sobre esa ruta es parte del bug, no del fix.
- **El header `Service-Worker-Allowed: /`** es necesario para que el SW pueda controlar el scope raíz aunque se sirva desde una subruta.
- Para reproducir el bug original en vec-dev, pegarle a la **ruta vieja** `/api/public/push/firebase-sw.js`: devuelve 200 con `text/html`. La ruta correcta `/ws/Public/index.php/api/public/push/firebase-sw.js` devuelve el JS.

## OBS para el dev (Ayrton Ortega)
El unit test `vec-fleet-web/src/commons/firebase/FcmTokenService.test.js:175-176` (it "registra el SW dinámico en /api/public/push/firebase-sw.js") sigue esperando la ruta vieja hardcodeada `'/api/public/push/firebase-sw.js'`, mientras el código ya produce `getApiBase() + '/public/push/firebase-sw.js'`. Test desactualizado (posible falso verde) o `getApiBase()` devuelve `/api` en ese setup de test. **Reportarlo, NO bloquea el cierre.**

## No ejecutable (documentar, no es bloqueo)
La duplicación `/api/api` de Slim y el 401 del middleware son específicos del enrutamiento Apache+BasePath de **PRODUCCIÓN**. No se reproducen en vec-dev y prod está fuera de límites por regla crítica. La card nota que en VEC (prod) ya se aplicó un **parche manual de infraestructura** para destrabar. El núcleo del fix (MIME + ruta dinámica) quedó validado por código + smoke en vec-dev.

## QA Report
VEC-3424 — https://vecfleet-kanban.atlassian.net/browse/VEC-3424
