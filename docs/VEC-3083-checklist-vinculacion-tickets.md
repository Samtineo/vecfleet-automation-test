# Checklist/Tickets – Vinculación de respuestas a tickets pendientes (VEC-3083)

## 1. ¿Qué hace esta feature?

Permite vincular la respuesta de un checklist a un ticket existente (en estado pendiente o en gestión). Antes, al completar un checklist podía generarse un ticket nuevo automáticamente (lógica anterior). Con VEC-3083:

- El ABM de Tipos de Formulario incorpora un multiselect de estados de ticket para configurar qué estados muestra el buscador.
- Al completar un formulario, si el tipo tiene `con_ticket = true`, se muestra un buscador de tickets filtrado por los estados configurados.
- El formulario guarda el `ticket_id` del ticket seleccionado.
- El ticket muestra una nueva sección "Checklists asociados" con los formularios vinculados.

---

## 2. Configuración en vec-dev

| Recurso | Valor |
|---|---|
| TipoFormulario de prueba | ID `44` ("QA VEC-3083"), `con_ticket = true` |
| `ticket_estados_json` | `["ABIERTO"]` |
| Ticket de prueba | ID `14`, Móvil `1`, estado `ABIERTO` |
| Formularios vinculados | IDs `282`, `283` (ticket_id = 14) |
| Atributo dinámico | ID del atributo de texto creado para el tipo 44 |

---

## 3. Endpoints relevantes

Base: `https://vec-dev.vecfleet.io/ws/Public/index.php/api`
Auth header: `Authorization-Token: <token>`

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/tickets/simple-search?estados=ABIERTO` | Busca tickets filtrando por estado (nuevo param) |
| GET | `/tickets/estados` | Lista todos los estados posibles del workflow |
| POST | `/formulario` | Crea formulario; acepta `ticket_id` para vincular |
| GET | `/tickets/{id}/formularios` | Retorna formularios vinculados al ticket |

---

## 4. Ejecución del QA

**Fecha:** 2026-05-12
**Entorno:** vec-dev

### Resumen

| CA | Descripción | Tipo | Resultado |
|---|---|---|---|
| CA1 | Configurar TipoFormulario con estados para buscador (UI) | UI | ❌ BLOQUEADO |
| CA2 | Buscador filtra por estados configurados en TipoFormulario (UI) | UI | ❌ BLOQUEADO |
| CA3 | `GET /tickets/simple-search?estados=ABIERTO` retorna tickets en ese estado | API | ✅ PASS |
| CA4 | `POST /formulario` con `ticket_id` crea formulario vinculado exitosamente | API | ✅ PASS |
| CA5 | `POST /formulario` sin `ticket_id` sigue funcionando (retrocompatibilidad) | API | ✅ PASS |
| CA6 | Buscador solo muestra tickets en los estados configurados | API | ✅ PASS |
| CA7 | Ticket en estado NO incluido en `ticket_estados_json` no aparece en buscador | API | ✅ PASS |
| CA8 | `ticket_id` queda guardado correctamente en la tabla `formularios` | API | ✅ PASS |
| CA9 | `GET /tickets/{id}/formularios` retorna los formularios vinculados al ticket | API | ✅ PASS |
| CA10 | Ticket asociado a formulario no muestra ícono de creación de checklist en grid | Manual | ✅ PASS |
| CA11 | Grid de tickets no crashea con los cambios de VEC-3083 | Manual | ✅ PASS |
| CA12 | Sección "Checklists asociados" visible en la vista de detalle del ticket | UI | ✅ PASS |
| CA13 | Entradas muestran: nombre del checklist, fecha de respuesta, usuario y acceso | UI | ✅ PASS |
| CA14 | Clic en ícono de acceso abre el formulario vinculado | UI | ❌ BLOQUEADO |
| CA15 | Formulario visualizado muestra link de regreso al ticket | UI | ❌ BLOQUEADO |
| CA16 | La pantalla de formulario reutiliza la pantalla existente | UI | ❌ BLOQUEADO |

**Resultado parcial:** 11/16 PASS — 5 BLOQUEADOS por bug (ver sección 5)

---

## 5. Bug: Crash en múltiples puntos del flujo

Durante el QA se identificó un bug que crashea la pantalla en tres escenarios distintos. La causa raíz en `TipoFormularioAbm.js` está documentada como comentario en VEC-3083. Para `FormularioAbm.js` la causa raíz exacta está pendiente de investigación.

### Puntos afectados

**1. Editar un Tipo de Formulario con `con_ticket = true` (TipoFormularioAbm.js)**

La pantalla cierra inesperadamente al entrar al ABM de edición.

- **Causa raíz:** `initForm()` incluye `GET /tickets/estados` dentro de un `Promise.all`. Cualquier fallo en esa promesa ejecuta `component.exit()` en el `.catch`, cerrando el formulario.
- **CAs bloqueados:** CA1, CA2

**2. Completar un formulario vinculado a un ticket (FormularioAbm.js)**

Al intentar completar/enviar un formulario que tiene `ticket_id` asignado, la pantalla falla.

- **Causa raíz:** Pendiente de investigación en `FormularioAbm.js`
- **Impacto:** Afecta el flujo funcional principal de la feature

**3. Visualizar un formulario desde "Checklists asociados" (FormularioAbm.js)**

Al hacer clic en el ícono de detalle (🔍) en la sección "Checklists asociados" de la vista del ticket, la pantalla falla al cargar el formulario.

- **Causa raíz:** Pendiente de investigación en `FormularioAbm.js`
- **CAs bloqueados:** CA14, CA15, CA16

### Notas adicionales

- CA10 y CA11 se verificaron manualmente con ticket ID `14` (grid no estaba disponible por bug preexistente de alias SQL en VEC-1138).
- CA12 y CA13 se validaron visualmente; la sección renderiza correctamente cuando los datos están disponibles.

---

## 6. Errores conocidos / no relacionados

- `GET /tickets/grid` retorna `SQLSTATE 1066 Not unique table/alias: 'reg'` — bug preexistente de VEC-1138, alias duplicado en `TicketsRepository.php` línea 1049–1050. No es parte de VEC-3083.

---

## 7. Estado del QA

**En progreso** — Pendiente resolución del bug de crash para completar CA1, CA2, CA14, CA15, CA16.
QA Report en Jira: pendiente de creación (se crea cuando todos los CAs estén ejecutados).
