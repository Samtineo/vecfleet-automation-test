# Checklist/Tickets – ABM de Clasificaciones + Presupuesto Detallado (VEC-3149)

## 1. ¿Qué hace esta feature?

Permite definir a qué tipo de ítem aplica cada clasificación (Repuesto/Producto, Mano de Obra o Ambos), y filtra el selector de clasificaciones en el presupuesto detallado según la sección en la que se esté trabajando.

- El ABM de Clasificaciones incorpora el campo **"Aplica a"** (toggles Repuesto/Producto y Mano de Obra).
- En el presupuesto detallado, el selector de clasificación del box **Repuestos** solo muestra clasificaciones de tipo Repuesto/Producto o Ambos.
- En el box **Mano de Obra**, solo muestra clasificaciones de tipo MO o Ambos.
- El campo "Aplica a" y el filtro del grid se ocultan cuando `tickets.trabajaConManoDeObra.habilitado = false`.
- Se agregó botón "Buscar" al filtro del grid (UX unificado con personas/móviles/combustibles).

---

## 2. Configuración en vec-dev

| Recurso | Valor |
|---|---|
| `panol.items.clasificacion.habilitado` | `true` |
| `tickets.trabajaConManoDeObra.habilitado` | `true` |
| `tickets.presupuesto.tipo` | `detallado` |
| `tickets.presupuesto.items.habilitado` | `true` |
| `tickets.presupuesto.items.show` | incluye `clasificacion` |
| Ticket de prueba | ID `221`, servicio `--SERVICIO DEFAULT--`, móvil `Test09`, estado `ABIERTO` |
| Clasificación test Repuesto | ID `7` — `QA-3149-Repuesto` (tipoItemId=1) |
| Clasificación test MO | ID `8` — `QA-3149-ManoObra` (tipoItemId=2) |
| Ítems del servicio | `Repuesto Default` (Producto), `Mano de Obra Default` (Mano De Obra) |

---

## 3. Endpoints relevantes

Base: `https://vec-dev.vecfleet.io/ws/Public/index.php/api`
Auth header: `Authorization-Token: <token>`

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/item/clasificaciones` | Lista clasificaciones (paginado) |
| GET | `/item/clasificaciones?tipoItem=1` | Lista clasificaciones para Repuesto/Producto o Ambos |
| GET | `/item/clasificaciones?tipoItem=2` | Lista clasificaciones para Mano de Obra o Ambos |
| POST | `/item/clasificaciones` | Crea clasificación con `tipo_item_id` |
| PUT | `/item/clasificaciones/{id}` | Actualiza clasificación |

---

## 4. Ejecución del QA

**Fecha:** 2026-05-13
**Entorno:** vec-dev

### Resumen

| CA | Descripción | Tipo | Resultado |
|---|---|---|---|
| CA1 | Grid muestra columna "Aplica a" cuando `trabajaConManoDeObra=true` | UI | ✅ PASS |
| CA2 | Filtro del grid tiene campo "Aplica a" y botón "Buscar" | UI | ✅ PASS |
| CA3 | Filtrar por "Aplica a = Repuesto/Producto" retorna solo esas clasificaciones | UI | ✅ PASS |
| CA4 | Crear clasificación con "Aplica a" = solo Repuesto/Producto | UI | ✅ PASS |
| CA5 | Crear clasificación con "Aplica a" = solo Mano de Obra | UI | ✅ PASS |
| CA6 | Crear clasificación con "Aplica a" = Ambos (ambos toggles activos, estado default) | UI | ✅ PASS |
| CA7 | No se pueden apagar ambos toggles simultáneamente | UI | ✅ PASS |
| CA8 | Editar clasificación existente y cambiar "Aplica a" — se guarda correctamente | UI | ✅ PASS |
| CA9 | Selector clasificación del box Repuestos solo muestra Repuesto/Producto o Ambos | UI | ✅ PASS |
| CA10 | Selector clasificación del box Mano de Obra solo muestra MO o Ambos | UI | ✅ PASS |
| CA11 | Modal de edición de ítem Repuesto muestra campo "Clasificación" | UI | ✅ PASS |
| CA12 | Modal de edición de ítem Mano de Obra muestra campo "Clasificación" | UI | ✅ PASS |
| CA13 | Clasificación asignada al agregar el ítem aparece precargada en el modal de edición | UI | ✅ PASS |
| CA14 | Si el ítem no tenía clasificación, el modal permite asignarla y guardar | UI | ✅ PASS |
| CA15 | Al guardar la edición del modal, la clasificación queda actualizada en el renglón | UI | ✅ PASS |
| CA16 | Modal de ítem Repuesto no muestra clasificaciones de tipo MO puro | UI | ✅ PASS |

**Estado actual:** 16/16 PASS ✅

---

## 5. Estado del QA

**COMPLETADO** — 16/16 CAs aprobados en vec-dev.

QA Report en Jira: **creado** — [VEC-3179](https://vecfleet-kanban.atlassian.net/browse/VEC-3179)
