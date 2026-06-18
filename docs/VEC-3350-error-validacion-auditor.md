# Tickets — Error en validación de auditor: adjuntos desaparecen tras recotización (VEC-3350)

## 1. ¿Qué hace esta feature?

Corrige un bug reportado por el cliente Telecom (GS-22198): al gestionar continuamente un ticket con validación de auditor, los adjuntos de tipo "informe de auditor" desaparecían después de una recotización si el usuario no recargaba la página. El sistema pedía cargar el adjunto nuevamente y luego bloqueaba la acción indicando que la cantidad de adjuntos no coincidía.

**Causa raíz 1 (Frontend):** `TicketAdjuntos.js` usaba un snapshot del ticket congelado en el constructor. Al ejecutar `initForm()` tras una recotización, reconstruía la lista de adjuntos desde ese snapshot stale, borrando el estado actualizado. `PUT /tickets/adjuntos` recibía la lista vacía → DELETE + re-INSERT → adjuntos eliminados de la DB.

**Causa raíz 2 (Backend):** Al promover un borrador adicional desde estado `RECOTIZAR` o `RECOTIZAR_SV`, el servicio calculaba `nextState = PRESUPUESTAR_ADIC`, una transición inexistente, devolviendo 403.

**Fix (commit cd96ded27):**
- `TicketAdjuntos.js`: `initForm()` refresca `this.ticket` desde `this.props.ticket` antes de reconstruir. `componentDidUpdate()` sincroniza `this.ticket` al cambiar el prop.
- `TicketsPresupuestosService.php:84-94`: detecta `RECOTIZAR`/`RECOTIZAR_SV` y usa `PRESUPUESTAR` en vez de `PRESUPUESTAR_ADIC`.

---

## 2. Configuración requerida

El flujo de auditor requiere las siguientes configs activas:

```sql
-- Habilita el flujo de validación de auditor
INSERT INTO `vec-dev`.config_business (seccion, grupo, subgrupo, parametro, valor) VALUES
('tickets', 'presupuesto', 'aprobacionAuditor', 'habilitado', 'true'),
('tickets', 'cambiosEstados', 'APROBAR_AUDITOR', 'categoria', '8'),
('tickets', 'cambiosEstados', 'APROBAR_AUDITOR', 'obligatorio', 'true'),
('tickets', 'presupuesto', 'borrador', 'habilitado', 'true');
```

Filas requeridas en `ticket_workflow` (si no existen):

```sql
INSERT INTO `vec-dev`.ticket_workflow (ticket_tipo, estado, accion, estado_siguiente, entra_paralizado, sale_paralizado) VALUES
('CORRECTIVO', 'PRESUPUESTADO', 'APROBAR_AUDITOR',     'PRESUPUESTADO', 0, 0),
('CORRECTIVO', 'PRESUPUESTADO', 'A_RECOTIZAR_AUDITOR',  'RECOTIZAR_SV',  0, 0),
('CORRECTIVO', 'RECOTIZAR_SV',  'PRESUPUESTAR',          'PRESUPUESTADO', 0, 0);
```

---

## 3. Endpoints

Base: `https://vec-dev.vecfleet.io/ws/Public/index.php/api`  
Auth header: `Authorization-Token: <token>`

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/validar-coincidencia-presupuestos-adjuntos/{ticketId}` | Valida si la cantidad de adjuntos (cat. 8) coincide con los presupuestos activos |
| POST | `/ticket-presupuestos/ticket/{ticketId}` | Crea presupuesto (form-urlencoded obligatorio) |
| PUT | `/tickets/adjuntos` | Actualiza la lista de adjuntos del ticket |
| POST | `/ticket-presupuestos/{id}/borrador` | Promueve borrador a Pendiente-Auditor |

**Gotcha:** el endpoint de validar coincidencia NO está bajo `/ticket-presupuestos`. URL correcta: `/api/validar-coincidencia-presupuestos-adjuntos/{ticketId}`.

**Gotcha:** `POST /ticket-presupuestos/ticket/{id}` no parsea JSON. Usar notación PHP form-urlencoded:

```
servicios[0][servicioId]=1&servicios[0][precio]=100&repuestos=0&manoDeObra=100
```

**Response de validar coincidencia:**
```json
{ "coincide": true }   // o false
```

---

## 4. Casos de prueba

| CA | Tipo | Descripción | Resultado |
|---|---|---|---|
| CA1 | Config | Config activa + categoría 8 existe | ✅ PASS |
| CA2 | UI | Adjuntar → recotizar → nuevo adjunto → Aprobar sin reload | ✅ PASS |
| CA3 | UI | Mismo flujo → Recotizar de nuevo sin reload | ✅ PASS (ver OBS-01) |
| CA4a | API | `coincide=false` sin adjunto cargado | ✅ PASS |
| CA4b | API | `coincide=true` tras recotización (N adj = N pres) | ✅ PASS |
| CA5 | API | APROBAR_AUDITOR sin adjunto → 204 (bloqueo es solo frontend) | ✅ PASS |
| CA6 | API | A_RECOTIZAR_AUDITOR sin adjunto → 204 | ✅ PASS |
| CA7 | UI | 3 rondas de recotización sin desfase en el conteo | ✅ PASS (ver OBS-01) |
| CA8 | Código | Regresión VEC-3203: fix aislado, no toca createItemsAndTasks() | ✅ PASS |
| CA9 | Código | Regresión VEC-3258: TicketPresupuestoDetallado.js no tocado | ✅ PASS |
| CA10 | Config | Borrador (activo=0) no infla el contador de coincidencia | ✅ PASS |

---

## 5. Data de prueba — vec-dev

| Dato | Valor |
|---|---|
| Ticket de prueba | ID 765 (CORRECTIVO) |
| Adjunto categoría 8 | ID 1174, 1175 |
| Presupuesto ciclo 1 | ID 503 (estado: Rechazado) |
| Presupuesto ciclo 2 | ID 504 (estado: Rechazado) |
| Presupuesto borrador | ID 505 (activo=0, no cuenta en coincidencia) |
| Perfil auditor | Perfil 719 (stineo) |

---

## 6. OBS-01 — Escenario adicional detectado: adjuntos > presupuestos

`validarCoincidenciaPresupuestosAdjuntos()` en `TicketsPresupuestosService.php:887` usa igualdad estricta (`===`). Tener más adjuntos que presupuestos también retorna `false`. La UI no limita ni informa cuántos adjuntos se requieren por ronda.

Este escenario excede el scope de VEC-3350. El fix funciona correctamente para el bug original. Mejora delegada a **VEC-3376** (asignada a Sofi Vigliaccio). Opciones: cambiar `===` a `>=` en backend, o agregar indicador visual en frontend.

---

## 7. Resultados QA

10/10 PASS (2026-06-18)  
**QA Report:** [VEC-3375](https://vecfleet-kanban.atlassian.net/browse/VEC-3375)  
**Card mejora pendiente:** [VEC-3376](https://vecfleet-kanban.atlassian.net/browse/VEC-3376)
