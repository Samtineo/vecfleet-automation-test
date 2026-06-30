---
name: qa-exec-VEC-3369
description: "QA exec VEC-3369: notificación por email al aprobar ticket que cruza umbral de % de consumo del período. E2E Tickets+PP+Notificaciones. CA de regresión. Estado: NO ejecutado aún (feature en consolidación)."
metadata:
  node_type: memory
  type: project
  originSessionId: current
---

# VEC-3369 — Notificación por alcance de % preventivo (E2E de regresión)

**Qué hace:** al **aprobar un ticket**, el sistema evalúa si `(consumido + comprometido) / presupuesto` de la **base del vehículo** cruza el umbral de una **regla activa con `accion_notificacion=true`** del período vigente. Si lo cruza, **envía email** a los administradores de presupuesto (responsable de base + jerarquía). Si ya notificó ese umbral+período, no re-notifica (anti-spam). PR #2113 (Matías Sosa).

**Es el lado "alerta" del combo PP-Reglas.** El lado "bloqueo" es VEC-3370 (On Hold). Ambos se consolidan en VEC-3377 (Pendiente). La campana in-app depende de VEC-2798 (Ayrton, En Curso) → **solo el canal EMAIL es testeable hoy**.

## Gates (verificados en vec-dev 2026-06-29)
- ✅ `periodoPresupuestario.habilitado = "true"`.
- ✅ Regla de notificación existe: config_id=4, **regla id=5 "SoloNotif", umbral 40%, accion_notificacion=true, accion_bloqueo=false, activa**. (También id=9 "Dup A 80" notif a 80%.)
- ⚠️ `notificaciones.email.modo = "legacy"` (NO hibrido/premium) → routing usa SMTP por defecto. **Riesgo: la entrega real del mail puede no ocurrir.** Confirmar entrega antes de dar PASS.

## Prerrequisitos para disparar la notificación
1. `periodos_config` activa con períodos generados (config_id=4 tiene reglas; confirmar que tenga período vigente + bases con presupuesto). NOTA: solo una periodos_config por tenant — verificar que la activa sea la que tiene las reglas.
2. Una **base con presupuesto asignado** (cascada Región→Subregión→Base, `PATCH /api/presupuestos/{id}`).
3. Un **vehículo** en esa base, con un **ticket** que tenga presupuesto, cuyo importe al aprobarse haga que `(consumido+comprometido)/asignado` cruce el 40%.
4. **Destinatario verificable:** la notificación va al responsable de la base + jerarquía. Para verificar por Gmail, asegurar que **stineo@vecfleet.io** (o un buzón accesible) sea responsable/recipiente, con `notificaciones_activas=1`.

## Pasos E2E (regresión)
1. Identificar/asignar presupuesto a una base B en el período de config_id=4 (ej. asignar $1000 a B).
2. Aprobar un ticket de un vehículo de B con presupuesto que lleve el consumo de B a ≥40% (ej. $400) → cruza la regla id=5.
3. El approve dispara la evaluación (VEC-3369) → INSERT en `notificacion_emails` + `notificacion_email_personas`.
4. `POST /crons/process-email-group` → mueve a `notificaciones_cola_emails`.
5. `POST /crons/process-email-queue` → envía SMTP + borra de la cola.
6. **Verificar:** email recibido (Gmail search del buzón destinatario). Asunto incluye el % alcanzado + link al período.
7. **Anti-spam:** aprobar otro ticket que mantenga el mismo umbral+período → NO debe re-notificar.

## Verificación — gaps conocidos
- **Sin acceso a DB (DBeaver)** desde el entorno QA actual → no puedo confirmar las filas `notificacion_emails`/cola directamente. Verificación por **Gmail** (el mail final) o pedir a dev/DBeaver.
- **modo=legacy** → si el SMTP por defecto no entrega a Gmail, el mail no llega aunque la notificación se haya generado. Si no llega, NO asumir bug de VEC-3369: primero descartar el gate de email (subir modo a hibrido o confirmar SMTP).

## CAs sugeridos
- CA1: aprobar ticket que cruza 40% → llega email con % y link. (regla id=5 notif)
- CA2: aprobar ticket que NO cruza el umbral → no llega email.
- CA3: anti-spam — segundo cruce del mismo umbral+período → no re-notifica.
- CA4: regla solo-bloqueo (id=6, sin notif) → no manda email (no aplica notificación).
- CA5 (negativo de gate): sin reglas activas / PP deshabilitado → no evalúa.

## Estado del setup en vec-dev (2026-06-29 — sesión nocturna, EN CURSO)

Avance grande; cortado en el paso del ticket. **Estado dejado en vec-dev:**
- **Config 4 "QA-VEC3266": `fecha_inicio` movida de 2026-07-01 → `2026-06-01`** (vía `PUT /periodo-configs/4`). Regeneró los 12 períodos. Período activo HOY = **id 163 (2026-06-01 → 06-30)**. (Restaurar a julio si se quiere, pero conviene dejarlo para terminar el QA.)
- **Presupuesto asignado $100.000** (monto_general, vía `POST /presupuestos/guardar-asignaciones`) en DOS cadenas del período 163:
  - Región id5→SubRegión id5→**Base 3 "Test"** (nodos 1949/1954/1956). Base 3 tiene 8 móviles + $2.500 comprometido previo. **← usar esta.**
  - Región id3→SubRegión id3→Base 9 (nodos 1947/1952/1960). **Base 9 NO tiene móviles → descartada.** (Limpiar si molesta.)
- **Móvil para el ticket: id 1307 "111HHH"** (Base 3, modelo tipo FURGON).
- Regla que dispara: id=5 "SoloNotif" 40% notif (config 4). Base 3 está en 2.5% ($2500/$100k) → un ticket de **$40.000** la lleva a 42.5% (cruza 40% notif, bajo 45% bloqueo id=6).

### BLOCKER donde cortamos
`POST /tickets` (correctivo, móvil 1307 embebido, servicio id=1, tareas=[]) → **400 sin body**. La validación `TicketsController::validate` (L1655) usa un `V::oneOf` condicional (selectedMoviles/persona/movil/llanta) — sospecha: múltiples ramas pasan vacuísmente y `oneOf` (exactamente una) falla; o `getInstanceFromRequest`/`validateLimitOfParallelTicketsPerService` rechazan algo del objeto móvil. **Próximo paso:** inspeccionar `getInstanceFromRequest` (L? en TicketsController) + probar payload mínimo (quizás mandar `selectedMoviles:[{id:1307}]` en vez de `movil` embebido, o ajustar para que solo UNA rama del oneOf valide). Reusar el body de la colección `vecfleet-api.postman_collection.json` (request "/tickets") como referencia exacta.

### Pasos restantes (post-ticket)
1. Cargar presupuesto $40.000 al ticket (`POST /ticket-presupuestos/ticket/{id}`; items costo_fijo, ej. item 32 MO Default $1000 × 40). Flujo Heineken (`trabajaConEstadosPresupuesto=true`): presupuesto Pendiente→(auditor)→Aprobado.
2. Aprobar → comprometido Base 3 = 42.5% → dispara regla id=5 → genera notificación.
3. `POST /crons/process-email-group` → `POST /crons/process-email-queue`. **Usuario verifica recepción del mail** (revisar a quién llega: responsable de Base 3 + jerarquía; si no llega, ajustar responsable a stineo).
4. Segundo ticket **$10.001** → total 52.5% → cruza regla id=6 (45% bloqueo) → debe **frenar la aprobación** (de paso prueba si el código de VEC-3370 está desplegado).

Feature en consolidación (VEC-3377 Pendiente supersede VEC-3370; campana in-app = VEC-2798 Ayrton En Curso). Solo canal EMAIL testeable. Buen E2E de regresión (Tickets+PP+Notificaciones).

Relacionadas: [[module-periodos-presupuesto]], [[module-notificaciones]], [[qa-exec-VEC-3266]].
