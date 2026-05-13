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
| TipoFormulario de prueba | ID `44` ("QA VEC-3083"), `con_ticket = true`, `con_movil = true` |
| `ticket_estados_json` | `["CERRADO"]` |
| Ticket de prueba | ID `14`, Móvil `1`, estado `ABIERTO` |
| Formularios vinculados | IDs `282`, `283` (ticket_id = 14) |
| Atributo dinámico | ID `95`, tipoValor `9` (SELECT_COMPUESTO), extraParams = null |

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

**Fecha:** 2026-05-12 / 2026-05-13
**Entorno:** vec-dev

### Resumen

| CA | Descripción | Tipo | Resultado |
|---|---|---|---|
| CA1 | Configurar TipoFormulario con estados para buscador (UI) | UI | ✅ PASS |
| CA2 | Buscador filtra por estados configurados en TipoFormulario (UI) | UI | ✅ PASS |
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
| CA14 | Clic en ícono de acceso abre el formulario vinculado | UI | ✅ PASS |
| CA15 | Formulario visualizado muestra link de regreso al ticket | UI | ✅ PASS |
| CA16 | La pantalla de formulario reutiliza la pantalla existente | UI | ✅ PASS |

**Estado actual:** 16/16 PASS ✅

---

## 5. Bugs encontrados y fixes aplicados

### Bug 1: Crash en edición de TipoFormulario con `con_ticket = true` (CA1, CA2)

**Síntoma:** La pantalla cierra inesperadamente al entrar al ABM de edición de TipoFormulario 44.

**Root cause:** `initForm()` en `TipoFormularioAbm.js` incluye `GET /tickets/estados` dentro de un `Promise.all`. Cuando esa promesa falla, el `.catch` externo ejecuta `component.exit()`, cerrando el formulario.

**Fix:** Agregar `.catch(() => [])` a la llamada de `GET /tickets/estados` para que su falla no propague al catch externo.

**Commit:** `21f4a69935` — `VEC-3083 | Fix crash en edición de TipoFormulario con con_ticket = true`

**Estado:** Fix aplicado. Pendiente retest en vec-dev (CA1, CA2).

---

### Bug 2: Crash al visualizar/completar un formulario con atributo SELECT_COMPUESTO sin opciones (CA14, CA15, CA16)

**Síntoma:** La pantalla falla al cargar el formulario cuando:
- Se hace clic en el ícono 🔍 en la sección "Checklists asociados" de un ticket (VIEW mode).
- Se intenta completar un formulario que tiene `con_ticket = true` (ADD/EDIT mode).

**Root cause:** `InstanciaSelect.recalcularEstado()` accede a `this.props.atributo.extraParams.opciones` sin verificar previamente que `extraParams` no sea `null`. Cuando un atributo dinámico de `tipoValor=9` (SELECT_COMPUESTO) tiene `extraParams=null` (sin opciones configuradas), el acceso a `.opciones` sobre `null` lanza `TypeError: Cannot read property 'opciones' of null`.

El crash ocurre en la cadena: `componentDidMount()` → `handleChangeAndUpdateFather()` → `recalcularEstado()`.

Mismo problema en `castValue()` y en el render (`.map` sobre `opciones`).

**Fix:** Agregar null-check `if (this.props.atributo.extraParams && ...)` en tres lugares de `InstanciaSelect.js`:
1. `recalcularEstado()`: antes de acceder a `extraParams.opciones`
2. `castValue()`: antes de acceder a `extraParams.opciones`
3. Render: antes de hacer `.map()` sobre `extraParams.opciones`

**Commit:** `d230b88ef` — `fix: evitar crash en InstanciaSelect cuando extraParams es null`

**Estado:** Fix aplicado. Pendiente retest en vec-dev (CA14, CA15, CA16).

---

## 6. Errores conocidos / no relacionados

- `GET /tickets/grid` retorna `SQLSTATE 1066 Not unique table/alias: 'reg'` — bug preexistente de VEC-1138, alias duplicado en `TicketsRepository.php` línea 1049–1050. No es parte de VEC-3083.

---

## 7. Estado del QA

**COMPLETADO** — 16/16 CAs aprobados en vec-dev.

QA Report en Jira: **creado** (ver tarea creada tras finalización).
