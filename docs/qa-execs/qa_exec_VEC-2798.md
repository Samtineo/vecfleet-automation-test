---
name: qa-exec-VEC-2798
description: "QA Exec para Notificaciones automáticas ante comentarios en tickets (módulo Tickets). Entorno vec.vecfleet.io (TEST histórico, NO producción). Resultado PASS."
metadata:
  type: project
---

# VEC-2798 — Notificaciones automáticas ante comentarios en tickets

Dev: Ayrton Ortega. Reporter/creator: Pamela Lettieri. QA: stineo. Componente **Tickets**.
Entorno **vec.vecfleet.io** (TEST verificado, notif system + Firebase activos). QA Report **VEC-3449**. **Resultado PASS.**

> Historial: esta card estuvo diferida (ver MEMORY project_vec2798_pending). Este exec consolida la ejecución final que cierra los OBS previos. Reemplaza la versión anterior (CA2 FAIL / E2E no ejecutado), que quedó saldada.

## CA de la card
1. Al generar un comentario se envía una notificación.
2. La notificación incluye el contenido del comentario.
3. Los destinatarios reciben la información.
4. No hace falta entrar al ticket para enterarse.

## Entorno

- **URL base: `vec.vecfleet.io`.**
- **ATENCIÓN — regla anti-producción:** la URL NO tiene sufijo `-dev`/`-new`/`-hotfix`/`-stage`/`-test`, lo que normalmente dispara la regla crítica de "prohibido testear en producción". En esta card se verificó **explícitamente que `vec.vecfleet.io` es un entorno de TEST histórico, NO producción** (perfil `stineo` de QA, vehículos ficticios, proyecto Firebase `test-notificaciones-vec`, `notificaciones.push.dry_run=false`). Prod real (`vecfleet.io` sin más) sigue vedada. Confirmar las señales de test **cada vez** antes de ejecutar.
- Motivo por el que se usa este entorno y no vec-dev: **vec-dev tiene la config de Firebase VACÍA** (`firebase-sw.js` con `apiKey:""`), por lo que FCM no entrega push ahí. `vec.vecfleet.io` es el único entorno permitido con Firebase configurado (notif system + Firebase activos).
- Auth: `POST /api/public/auth/login` con `usuario`/`clave`; token en `resp.usuario.token` (o `resp.token`). Header en llamadas: `Authorization-Token: <token>`.

## Prerrequisitos

- Dos usuarios de prueba distintos con acceso al mismo ticket: **stineo** (creador) y **Stineo2** (segundo). Necesarios porque el autor del comentario NO se autonotifica; hace falta un segundo usuario para observar la notificación.
- Un ticket donde ambos puedan comentar. En esta ejecución: crear un ticket correctivo con payload mínimo (movil + servicio 188 + tarea 265) como stineo. Ticket usado: **4788** (móvil 30075).
- No requiere permiso especial nuevo para comentar/notificar (la audiencia se resuelve por participación en el ticket, no por permiso).
- Para probar entrega push a dispositivo real: navegador con Service Worker Firebase activo y token FCM registrado. NO ejecutado (ver Gotchas), no bloqueante.

## Endpoints usados

| Método | Endpoint | Para qué |
|---|---|---|
| POST | `/api/public/auth/login` | Autenticación (token en `resp.usuario.token`) |
| POST | `/api/ticket-comentarios/ticket/{ticketId}` | Crear un comentario en el ticket (dispara el evento). Body `{comentario:"..."}` → 201 |
| GET | `/api/notificaciones/no-leidas/count` | Contador de no leídas (señal observable principal) |
| GET | `/api/notificaciones` | Listado de notificaciones (verificar título/cuerpo/url) |
| POST | `/notificaciones/fcm-token` | Registrar token FCM del dispositivo (solo para push real) |
| DELETE | `/notificaciones/fcm-token` | Baja del token FCM (apagado global del push) |

## Arquitectura verificada por código (namespace `Notifications/`)

- `TicketsComentariosService` al crear comentario despacha evento **`ComentarioAgregado`** (incluye `contenido = $comentario->getComentario()`) vía `SynchronousEventDispatcher`.
- **`NotificarParticipantesCuandoHayComentarioHandler`**: arma `NotificacionPayload` — titulo `"Nuevo comentario en Ticket #{id}"`, cuerpo `mb_substr($contenido, 0, 140)`, url `/tickets/{id}#comentarios`. Dispara **async** en `register_shutdown_function` (tras `fastcgi_finish_request`; no bloquea la respuesta del POST) con canal `CanalFcmPush`.
- **`NotificacionService::notificar`** **persiste en la tabla `notificaciones` (fuente de verdad = campanita in-app)** además de enviar por los canales. Constante `MAX_LONGITUD_CUERPO_PUSH = 140`.
- Audiencia **`AudienciaParticipantesTicket`**: creador + quienes comentaron, **EXCLUYE al autor del comentario nuevo** (no autonotificación).
- Datos de la notificación persistida: `tipo=COMENTARIO_NUEVO_EN_TICKET`, `titulo="Nuevo comentario en Ticket #{id}"`, `url=/tickets/{id}#comentarios`.

## Receta de ejecución (reproducible, 100% por API)

1. Login 2 usuarios (stineo creador, Stineo2 segundo).
2. Crear ticket correctivo (payload mínimo movil + servicio 188 + tarea 265) como stineo.
3. Comentar: `POST /api/ticket-comentarios/ticket/{ticketId}` `{comentario:"..."}` (201).
4. Verificar in-app del destinatario: `GET /api/notificaciones` y `GET /api/notificaciones/no-leidas/count`.

## Casos de prueba (PASS)

| CA | Verificación | Resultado |
|----|--------------|-----------|
| Dispara al comentar | notif in-app id 20 generada (count 2→3) | ✅ |
| Contenido 140 chars | comentario 202 chars → cuerpo truncado a 140 exactos; 57 chars → completo | ✅ |
| Título + deep-link | "Nuevo comentario en Ticket #4788", url `/tickets/4788#comentarios` | ✅ |
| Audiencia | stineo (creador) recibió | ✅ |
| Autor excluido | Stineo2 (autor) NO se auto-notificó (0) | ✅ |
| Bidireccional | stineo comenta → Stineo2 (participante) recibió | ✅ |

## OBS previos saldados

- **OBS-1** (cuerpo sin contenido del comentario) → **RESUELTO**: el cuerpo ahora incluye el comentario, truncado a 140 chars (`mb_substr($contenido, 0, 140)`).
- **OBS-3** (campanita no cableada) → estaba **desactualizado**; sí persiste in-app (tabla `notificaciones`).
- **OBS-2** (destinatarios configurables) → **scope acotado** a participantes + creador. No se implementó configuración; queda fuera de alcance de esta card.

## No E2E (no bloqueante)

Entrega del push FCM a device: canal invocado + Firebase configurado en `vec.vecfleet.io`, pero la recepción real necesita hardware. La notificación **in-app (campanita)** es el primario y quedó validada E2E. (Depende del SW FCM de **VEC-3424**, cerrado.)

## Gotchas

- **Entorno sin sufijo pero es TEST:** `vec.vecfleet.io` dispara la alarma anti-producción por no tener `-dev`. Verificar señales de test (perfil stineo, dominios ficticios, proyecto Firebase `test-notificaciones-vec`, `notificaciones.push.dry_run=false`) antes de ejecutar. No asumir; confirmar cada vez.
- **Regresión 100% por API (sin navegador ni FCM):** usar la tabla `notificaciones` como señal observable vía `GET /api/notificaciones/no-leidas/count` y `GET /api/notificaciones`. La persistencia in-app ocurre siempre que se dispara el evento, independientemente de si el push FCM llega.
- **Autonotificación excluida:** el autor del comentario nuevo NO recibe notificación. Para observar una notificación siempre hace falta un **segundo usuario** participante del ticket.
- **Handler async post-respuesta:** el envío ocurre en `register_shutdown_function` tras `fastcgi_finish_request`. La notificación puede tardar un instante en persistir después de que el POST de comentario responde. Si el count no cambió de inmediato, reintentar el GET.
- **Truncado a 140:** cuerpos > 140 chars se cortan exactos en 140 (verificado con comentario de 202 chars). Cuerpos cortos van completos.
- **Sin silenciado por ticket:** una vez que un usuario comenta en un ticket queda suscrito de forma permanente. El único apagado es global (borrar token FCM / revocar permiso del navegador).

## Datos de prueba

`vec.vecfleet.io`: ticket **4788** (móvil 30075), comentarios de stineo/Stineo2, notif in-app **id 20**.

## QA Report

VEC-3449 — https://vecfleet-kanban.atlassian.net/browse/VEC-3449
