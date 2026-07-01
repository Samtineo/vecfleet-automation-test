---
name: qa-exec-VEC-3369
description: "QA exec VEC-3369: notificación por alcance de % de presupuesto al aprobar un ticket que cruza el umbral de consumo de la base. Canal = campanita in-app + push FCM (NUNCA email). Estado: PASS en scope (E2E en vec.vecfleet.io). Madre On Hold. Hallazgo fuera de scope: notif acoplada a aprobar()."
metadata:
  node_type: memory
  type: project
  originSessionId: current
---

# VEC-3369 — Notificación por alcance de % de presupuesto (E2E)

**Estado (2026-07-01): PASS en scope.** Madre en **On Hold** por decisión del usuario (no se transiciona). QA Report como Tarea separada → Done.

**Qué hace:** al **aprobar un ticket**, el sistema evalúa si el consumo (consumido + comprometido) de la **base del vehículo** cruza el umbral de una **regla activa con notificación** del período vigente. Si lo cruza, genera una **notificación** a los administradores de presupuesto (usuarios con permiso `PERIODO_PRESUPUESTARIO_{REGIONES|SUBREGIONES|BASES}_MODIFICAR` sin baja de suscripción). PR #2113 (Matías Sosa).

**Canal (corrección importante):** el canal es **campanita in-app (tabla `notificaciones`) + push FCM**, por diseño. **NUNCA fue email.** La mención de "email" en versiones anteriores de este exec fue una mala interpretación del feature y queda anulada. El disparo es por el sistema de eventos: `UmbralPresupuestarioAlcanzado` → INSERT en `notificaciones` + push FCM.

## Resultado por CA

| CA | Escenario | Resultado | Detalle |
|----|-----------|-----------|---------|
| CA1 | Happy path: aprobar ticket que cruza el umbral de la base → se genera la notif | ✅ PASS (empírico) | Notif id 13, validada visualmente por Samuel en la campanita |
| CA2 | Contenido de la notif: base + % alcanzado + umbral, url a la base | ✅ PASS (empírico) | Título "Umbral presupuestario alcanzado (40%)", cuerpo con base + % + umbral |
| CA3 | Destinatarios: admins de presupuesto sin baja de suscripción | ✅ PASS (empírico) | stineo y Stineo2 recibieron la notif |
| CA4 | No-destinatario: usuario sin permiso / con baja de suscripción → no recibe | 📋 Code-verified | `AudienciaAdministradoresPresupuesto` filtra por permiso + suscripción |
| CA6 | No cruza el umbral → no se genera notif | 📋 Code-verified | `TicketsService::notificarReglasDeUmbral` L1947/L1953 |
| CA7 | Dedupe: mismo umbral+período ya notificado → no re-notifica | 📋 Code-verified | `notificarReglasDeUmbral` |

## Setup que funcionó (receta) — vec.vecfleet.io (entorno de test)

- Config PP **86 "TEST GeVilla"**, período activo **1455** (julio), regla **id=1 (40% notif)**.
- Presupuesto asignado a la base vía `POST /presupuestos/guardar-asignaciones` (cascada Región→SubRegión→Base). **Gotcha:** usar el `presupuesto_id`, NO el id de la base.
- Ticket correctivo con payload mínimo (`movil:{id}` + servicio + tareas).
- Presupuesto del ticket queda **Pendiente (201)** → **aprobación MANUAL** `POST /tickets/aprobar/{id}` (204) → dispara la notif.
- Verificar con `GET /notificaciones` del destinatario (o campanita in-app).
- **Gotcha entorno:** `periodoPresupuestario.habilitado` se revierte por el sync del maestro (`parametros_clientes`); para dejarlo firme, setear en el maestro.
- Datos de prueba dejados en vec.vecfleet.io: bases 1161/1175 fondeadas, tickets 4779-4782.

## Hallazgo fuera de scope → ROADMAP (incremental)

La notif está **acoplada a `TicketsService::aprobar()`** (L2006), NO al evento genérico "presupuesto comprometido". Queda **muda** en cualquier camino que comprometa presupuesto sin pasar por `aprobar()`:

- **Auto-aprobación** de presupuesto (`TicketsPresupuestosService::aprobarPresupuesto`) no llama a `notificarReglasDeUmbral`.
- **Workflow con auditor TERMINAL** (si `APROBAR_AUDITOR` va directo a APROBADO): el `aprobar` final daría 4031 y la notif no corre. En vec-dev/Heineken el auditor es intermedio → hoy funciona, pero es dependencia frágil del `ticket_workflow` del tenant, no garantizada por config. (Análisis El Alquimista, candidata INC-007.)
- **Heineken hoy NO bloquea** (no usan auto-aprobación; su flujo con auditor pasa por el `aprobar` final).

**ROADMAP:** cuando habiliten las notificaciones (push) en el entorno de **Heineken**, re-testear el envío de la notif en ESE entorno (confirmar que el flujo con auditor dispara la notif). Verificación decisiva: `SELECT ... FROM ticket_workflow WHERE accion IN ('APROBAR_AUDITOR','APROBAR')` en Heineken → ¿APROBAR_AUDITOR terminal o intermedio?

## Cierre

QA Report (Tarea → Done). Comentario en la madre con el hallazgo + nota de roadmap, arrobando a Matias Sosa (dev) y Marcelo Vieyra (producto). **Madre On Hold** hasta que el usuario decida cerrarla.

Relacionadas: [[module-periodos-presupuesto]], [[module-notificaciones]], [[qa-exec-VEC-3266]].
