---
name: qa-exec-VEC-2798
description: "QA Exec para Notificaciones automáticas ante comentarios en tickets (módulo Tickets). Entorno vec.vecfleet.io (TEST histórico, NO producción)."
metadata:
  type: project
---

## Card

- **VEC-2798** — "Notificaciones automáticas ante comentarios en tickets". Historia, componente **Tickets**.
- Status: Deployed To Stage. Reporter/creator: Pamela Lettieri. Dev: Ayrton Ortega. QA: stineo.
- **CA de la card:**
  1. Al generar un comentario se envía una notificación.
  2. La notificación incluye el contenido del comentario.
  3. Los destinatarios reciben la información.
  4. No hace falta entrar al ticket para enterarse.
- **Alcance adicional** (mencionado, no formalizado como CA): "permitir configurar destinatarios" y canal email como posibilidad.

## Entorno

- **URL base: `vec.vecfleet.io`.**
- **ATENCIÓN — regla anti-producción:** la URL NO tiene sufijo `-dev`/`-new`/`-hotfix`/`-stage`/`-test`, lo que normalmente dispara la regla crítica de "prohibido testear en producción". En esta card se verificó **explícitamente que `vec.vecfleet.io` es un entorno de TEST histórico, NO producción**, mediante estas señales:
  - Existe perfil `stineo` (usuario de QA, no de cliente real).
  - Existen vehículos ficticios con dominio `723*`.
  - **Firebase habilitado únicamente ahí**, con proyecto `test-notificaciones-vec` (nombre explícito de test).
  - `notificaciones.push.dry_run=false` (push real habilitado para probar entrega).
- Motivo por el que se usa este entorno y no vec-dev: **vec-dev tiene la config de Firebase VACÍA** (`firebase-sw.js` con `apiKey:""`), por lo que FCM no entrega push ahí. `vec.vecfleet.io` es el único entorno permitido con Firebase configurado.
- Auth: `POST /api/public/auth/login` con `usuario`/`clave`; token en `resp.usuario.token` (o `resp.token`). Header en llamadas: `Authorization-Token: <token>`.

## Prerrequisitos

- Dos usuarios de prueba distintos con acceso al mismo ticket: **stineo** y **Stineo2** (necesarios porque el autor del comentario NO se autonotifica; hace falta un segundo usuario para observar la notificación).
- Un ticket existente donde ambos usuarios puedan comentar (en esta ejecución: **ticket 8**).
- No requiere permiso especial nuevo para comentar/notificar (la audiencia se resuelve por participación en el ticket, no por permiso).
- Para probar la **entrega push a dispositivo real**: navegador con Service Worker de Firebase activo y token FCM registrado (`POST /notificaciones/fcm-token`). NO ejecutado en esta corrida (ver Gotchas).

## Endpoints usados

| Método | Endpoint | Para qué |
|---|---|---|
| POST | `/api/public/auth/login` | Autenticación (token en `resp.usuario.token`) |
| POST | `/api/ticket-comentarios/ticket/{id}` | Crear un comentario en el ticket (dispara el evento) |
| GET | `/notificaciones/no-leidas/count` | Contador de notificaciones no leídas (señal observable principal) |
| GET | `/notificaciones` | Listado de notificaciones no leídas (verificar tipo/título/url) |
| POST | `/notificaciones/fcm-token` | Registrar token FCM del dispositivo (solo para push real) |
| DELETE | `/notificaciones/fcm-token` | Baja del token FCM (apagado global del push) |

## Arquitectura verificada por código (code-verified)

Sistema de eventos bajo namespace `Notifications/` (distinto del viejo `Notification/`):

- `TicketsComentariosService::create` (L41) despacha el evento **`ComentarioAgregado`** vía `SynchronousEventDispatcher` → handler **`NotificarParticipantesCuandoHayComentarioHandler`**.
- El handler se ejecuta **async** dentro de `register_shutdown_function` (tras `fastcgi_finish_request`); no bloquea la respuesta HTTP del POST de comentario.
- `NotificacionService::notificar` (`Service/NotificacionService.php`) hace **dos cosas por cada destinatario**:
  1. **Persiste una fila en la tabla `notificaciones`** (centro de notificaciones / campanita in-app). Esta es la **fuente de verdad** y la señal observable por API.
  2. **Despacha por el canal `CanalFcmPush`** (FCM push al dispositivo).
- Audiencia **`AudienciaParticipantesTicket`**: todos los usuarios que comentaron en el ticket + el creador del ticket, **excluyendo al autor del comentario nuevo** (no autonotificación).
- Datos de la notificación persistida: `tipo=COMENTARIO_NUEVO_EN_TICKET`, `titulo="Nuevo comentario en Ticket #{id}"`, `url=/tickets/{id}#comentarios`.

## Casos de prueba

Ejecución empírica: `vec.vecfleet.io`, ticket 8, usuarios stineo + Stineo2, 2026-07-01.

| CA | Escenario | Resultado | Observación |
|---|---|---|---|
| 01 | Al generar un comentario se envía notificación (se persiste fila en `notificaciones` + se despacha FCM) | ✅ PASS | Verificado vía `notificaciones` + code-verified del canal FCM |
| 02 | La notificación incluye el **contenido del comentario** | ❌ FAIL | Cuerpo genérico, no incluye el texto. Ver OBS-01 |
| 03 | Los destinatarios (participantes) reciben la info | ✅ PASS | Stineo2 comenta → count de stineo pasa a 1 |
| 04 | No hace falta entrar al ticket (campanita in-app fuera del ticket) | ✅ PASS | `GET /notificaciones` devuelve la notificación sin abrir el ticket |
| — | Autonotificación: el autor del comentario NO se notifica a sí mismo | ✅ PASS | stineo comenta → su count sigue 0; Stineo2 (autor) count = 0 |
| — | Alcance: destinatarios configurables | 📋 OBS | No implementado. Ver OBS-02 |
| — | Entrega push a dispositivo real (FCM) | ⏸️ NO EJECUTADO | Requiere navegador con token FCM. No bloqueante (ver Gotchas) |

### Secuencia E2E ejecutada (reproducible)

1. Baseline: `GET /notificaciones/no-leidas/count` para stineo y Stineo2 → **0 / 0**.
2. **stineo** comenta en ticket 8 (`POST /api/ticket-comentarios/ticket/8`) → count de **stineo sigue 0** (autor excluido).
3. **Stineo2** comenta en ticket 8 → **count de stineo = 1** (participante notificado); **count de Stineo2 (autor) = 0** (no se autonotifica).
4. `GET /notificaciones` (stineo) → notificación persistida con `tipo=COMENTARIO_NUEVO_EN_TICKET`, `titulo="Nuevo comentario en Ticket #8"`, `url=/tickets/8#comentarios`.

## Gotchas

- **Entorno sin sufijo pero es TEST:** `vec.vecfleet.io` dispara la alarma anti-producción por no tener `-dev`. Antes de ejecutar, verificar las señales de test (perfil stineo, dominios `723*`, proyecto Firebase `test-notificaciones-vec`, `notificaciones.push.dry_run=false`). No asumir; confirmar cada vez. Prod real (`vecfleet.io` sin más) sigue vedada.
- **Método de automatización reusable para regresión (sin navegador):** el E2E se hace **100% por API**, usando la tabla `notificaciones` como señal observable a través de `GET /notificaciones/no-leidas/count` y `GET /notificaciones`. **No requiere Playwright ni FCM.** La campanita in-app es la fuente de verdad; la persistencia en `notificaciones` ocurre siempre que se dispara el evento, independientemente de si el push llega o no.
- **Autonotificación excluida:** el autor del comentario nuevo NO recibe notificación. Para observar una notificación siempre se necesita un **segundo usuario** que sea participante del ticket.
- **Handler async post-respuesta:** el envío ocurre en `register_shutdown_function` tras `fastcgi_finish_request`. La notificación puede tardar un instante en persistir después de que el POST de comentario responde 200. Si el count no cambió de inmediato, reintentar el GET.
- **Push real no verificable por API:** el envío a dispositivo requiere navegador con Service Worker Firebase y token FCM registrado. No se ejecutó. No es bloqueante: la campanita in-app (tabla `notificaciones`) es la fuente de verdad y quedó verificada.
- **Sin silenciado por ticket:** una vez que un usuario comenta en un ticket, queda suscrito de forma permanente a las notificaciones de ese ticket. El único apagado es global (borrar token FCM / revocar permiso del navegador). Ver OBS-03.

## OBS (levantar con Ayrton/PO)

- **OBS-01 (CA incumplido):** el cuerpo de la notificación **NO incluye el contenido del comentario**; muestra un texto genérico: *"Alguien comentó en un ticket en el que participás."* El CA 2 pide explícitamente "la notificación incluye el contenido del comentario". Confirmado empíricamente. **Gap de CA.**
- **OBS-02 (gap vs alcance):** destinatarios **hardcodeados** a los participantes del ticket. El alcance mencionaba "configurar destinatarios"; no existe ninguna configuración para elegirlos. **Gap vs alcance.**
- **OBS-03 (comportamiento):** **no hay silenciado por ticket.** Una vez que comentás quedás suscrito para siempre; el único apagado es global (borrar token / revocar permiso del navegador). Asimetría con `AudienciaAdministradoresPresupuesto`, que sí respeta la baja de suscripción; `AudienciaParticipantesTicket` no.
- **Canales entregados:** push FCM + campanita in-app. **NO email** (el alcance lo mencionaba como posibilidad; no se implementó).

## Resultado

**E2E funcional PASS.** La feature entrega el mecanismo de notificación completo (disparo por evento + persistencia en `notificaciones` + despacho FCM), con **2 gaps vs CA/alcance** documentados como OBS para Ayrton/PO:
- OBS-01: la notificación no incluye el contenido del comentario (incumple CA 2).
- OBS-02: destinatarios no configurables (gap vs alcance).

## QA Report

VEC-2798 — https://vecfleet-kanban.atlassian.net/browse/VEC-2798
