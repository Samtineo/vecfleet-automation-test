---
name: qa-exec-vec-3350
description: "QA Exec VEC-3350 — Error en validación de auditor: adjuntos desaparecen tras recotización. 10/10 PASS. QA Report: VEC-3375. Card mejora: VEC-3376 (Sofi). Finalizada."
metadata:
  node_type: memory
  type: project
  originSessionId: 8bf28f2b-3feb-46fc-aa8b-2f46ff497a9a
---

## Feature / Bug

Reportado por Hassan Salum (Telecom), relacionado con GS-22198.

**Bug 1 (Frontend):** `TicketAdjuntos.js` usaba snapshot stale del ticket. Después de recotizar, `initForm()` reconstruía la lista de adjuntos desde el snapshot congelado en el constructor, borrando el estado actualizado. Al guardar: `PUT /tickets/adjuntos` con lista vacía → DELETE+re-INSERT → adjuntos eliminados físicamente.

**Bug 2 (Backend):** Al promover borrador adicional desde RECOTIZAR/RECOTIZAR_SV, `create()` calculaba `nextState=PRESUPUESTAR_ADIC`, transición inexistente → 403.

**Fix (commit cd96ded27):**
- `TicketAdjuntos.js`: `initForm()` refresca `this.ticket` desde `this.props.ticket` antes de reconstruir. `componentDidUpdate()` sincroniza `this.ticket` al cambiar el prop.
- `TicketsPresupuestosService.php:84-94`: `$esRecotizacion = in_array(['RECOTIZAR','RECOTIZAR_SV'])` → usa `PRESUPUESTAR` en vez de `PRESUPUESTAR_ADIC`.

## Entorno y configuración

- Ticket de prueba: **765** (CORRECTIVO)
- Configs habilitadas vía DBeaver:
  - `tickets.presupuesto.aprobacionAuditor.habilitado = true`
  - `tickets.cambiosEstados.APROBAR_AUDITOR.categoria = 8`
  - `tickets.cambiosEstados.APROBAR_AUDITOR.obligatorio = true`
  - `tickets.presupuesto.borrador.habilitado = true`
- Filas agregadas en `ticket_workflow` (vec-dev):
  ```sql
  INSERT INTO `vec-dev`.ticket_workflow (ticket_tipo, estado, accion, estado_siguiente, entra_paralizado, sale_paralizado) VALUES
  ('CORRECTIVO', 'PRESUPUESTADO', 'APROBAR_AUDITOR',    'PRESUPUESTADO', 0, 0),
  ('CORRECTIVO', 'PRESUPUESTADO', 'A_RECOTIZAR_AUDITOR','RECOTIZAR_SV',  0, 0),
  ('CORRECTIVO', 'RECOTIZAR_SV',  'PRESUPUESTAR',        'PRESUPUESTADO', 0, 0);
  ```

## Presupuestos usados en la ejecución

| ID | Estado final | Notas |
|---|---|---|
| 503 | Rechazado | Creado en sesión anterior, ciclo 1 |
| 504 | Rechazado | Ciclo 2 (proveedor re-submite desde RECOTIZAR_SV) |
| 505 | Borrador | Creado para CA10, activo=0 |

## Adjuntos de ticket 765

| ID | Archivo | Categoría |
|---|---|---|
| 1174 | 2026-06-d6b2942d51926aef.pdf | 8 |
| 1175 | 2026-06-2ebdab4191709b03.pdf | 8 |

## Resultados CAs

| CA | Tipo | Descripción | Resultado |
|---|---|---|---|
| CA1 | Config | Config activa + categoría 8 existe | ✅ PASS |
| CA2 | UI | Adjuntar → recotizar → nuevo adjunto → **Aprobar** sin reload | ✅ PASS |
| CA3 | UI | Mismo flujo → **Recotizar de nuevo** sin reload | ✅ PASS — ver OBS-01 |
| CA4a | API | coincidencia=false sin adjunto | ✅ PASS |
| CA4b | API | coincidencia=true tras recotización (2 adj vs 2 pres) | ✅ PASS |
| CA5 | API | APROBAR_AUDITOR sin adjunto → 204 (bloqueo es solo frontend) | ✅ PASS |
| CA6 | API | A_RECOTIZAR_AUDITOR sin adjunto → 204 | ✅ PASS |
| CA7 | UI | 3 rondas de recotización sin desfase | ✅ PASS — ver OBS-01 |
| CA8 | API | Regresión VEC-3203: fix aislado en create(), no toca createItemsAndTasks() | ✅ PASS (código) |
| CA9 | API | Regresión VEC-3258: TicketPresupuestoDetallado.js no tocado por fix | ✅ PASS (código) |
| CA10 | Config | borrador no infla coincidencia (True antes=True después) | ✅ PASS |

**Progreso: 10/10 PASS. QA Report: VEC-3375. Card de mejora: VEC-3376 (asignada a Sofi Vigliaccio). VEC-3350 Finalizada.**

## CAs UI — pasos para ejecución manual

### CA2 — Aprobar sin reload
1. Abre ticket CORRECTIVO en vec-dev, `aprobacionAuditor=true`
2. Proveedor sube presupuesto → Pendiente-Auditor
3. Adjuntar archivo en categoría 8
4. Auditor: Solicitar recotización → presupuesto Rechazado
5. Proveedor: nuevo presupuesto → Pendiente-Auditor
6. Adjuntar nuevo informe (SIN recargar página)
7. Auditor: **Aprobar** → debe funcionar sin "La cantidad de adjuntos no coincide"

### CA3 — Rechazar sin reload
Igual que CA2 pero paso 7: Rechazar.

### CA7 — 3 rondas
Mismo flujo pero 3 ciclos completos (2 rechazos + aprobación final). Verificar que no hay desfase en el conteo.

## Hallazgo OBS — check estricto en validarCoincidenciaPresupuestosAdjuntos

`TicketsPresupuestosService.php` línea 887 usa `===` (igualdad estricta):
```php
return $cantidadPresupuestos === $cantidadAdjuntos;
```
Tener MÁS adjuntos que presupuestos también retorna `false`. La UI no limita ni informa cuántos adjuntos cargar por ronda, por lo que el usuario puede desfasar el contador sin saberlo.

Opciones en discusión (comentario en card, @Sofia Vigliaccio + @mvieyra):
1. Cambiar check a `>=` (backend, más permisivo)
2. Agregar indicador visual en UI (frontend)

CA3 fue afectado por este problema durante el test (adjuntos acumulados de rondas previas). Re-test pendiente sobre ticket limpio una vez definida la opción de fix.

## Gotchas críticos

- **Form-urlencoded obligatorio**: `POST /ticket-presupuestos/ticket/{id}` no parsea JSON. Usar notación PHP.
- **ticket_workflow incompleto en vec-dev**: faltan las filas de APROBAR_AUDITOR/A_RECOTIZAR_AUDITOR antes del setup. Ya insertadas.
- **Borrador bloqueado si existe Pendiente-Auditor**: el endpoint `/borrador` también valida la existencia de presupuesto activo.
- **coincidencia semantics**: el conteo incluye 'Rechazado' (intencionalmente). En N rondas de recotización, N adjuntos = N presupuestos históricos → coincidencia=true.
- **Endpoint validar-coincidencia**: está fuera del grupo `/ticket-presupuestos`. URL correcta: `/api/validar-coincidencia-presupuestos-adjuntos/{ticketId}`.
- **Permiso borrador**: requiere al menos uno de 4 permisos VEC-3231. Perfil 719 no los tiene por defecto. Para testear: agregar y revertir temporalmente.
