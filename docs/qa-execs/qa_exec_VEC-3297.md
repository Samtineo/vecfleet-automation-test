---
name: qa-exec-vec-3297
description: "QA Exec para VEC-3297 — Tickets | Generación masiva de correctivos desde la grilla de Móviles no funciona (fix frontend, mismatch history v5 / react-router-dom v4). Entorno vec-hotfix."
metadata:
  node_type: memory
  type: project
---

## Entorno
- **vec-hotfix**. La card estaba desplegada en hotfix; la validación se hizo ahí (build `v2.13.12b`, commit `#88814dd`, branch `fixs-2-13-12b`).
- Grilla afectada: **Vehículos / Móviles** → acción "Crear Correctivos" (generación masiva de tickets correctivos).
- Config gate: `tickets.generacionMasiva.habilitado="true"` (verificado por API en vec-hotfix, ON). Gatea la aparición de los checkboxes de selección y de la llave (`fa-wrench`) en la grilla de Vehículos.
- En vec-hotfix `abono/gerenciadores` está en `false` → la carga de gerenciadores por subregión (en `CorrectivosAbm`, map sobre `base_eloquent.sub_region_eloquent`) NO se dispara. Escenario gerenciadores ON queda fuera de cobertura (ver OBS-02).

## Feature / Causa raíz
Flujo: en la grilla de Móviles el usuario selecciona uno o varios vehículos y usa la llave "Crear Correctivos" para generar tickets correctivos en masa. El destino es el ABM de Correctivos (`CorrectivosAbm`), que espera recibir los móviles seleccionados.

**Causa raíz (bug):** mismatch entre `history` v5 y `react-router-dom` v4. El código navegaba pasando estado embebido en el objeto de ubicación (`push({pathname, state})` / `<Redirect to={{pathname, state}}>`). En `history` v5 ese `state` embebido se descarta → `location.state.moviles` llegaba `null` a `CorrectivosAbm`. Con la lista de móviles nula, la pantalla de Crear Correctivo caía en la rama de "móvil único" y renderizaba el `Select` de móviles vacío.

- Bug **latente desde 09/2024**: VEC-657 subió `history` a `^5.3.0`. Aflora en instalaciones frescas de `node_modules` (versión ≥ `2.13.10a`), cuando el lockfile resuelve la v5.

**Fix (`MovilesGrid.jsx`, función `generarCorrectivos`):**
- Rama **multi-móvil**: pasa a usar la firma `push(path, state)` — `props.history.push('/correctivos/add/moviles', {moviles: selectedMoviles})`. Esa firma es compatible tanto con v4 como con v5 (el `state` va como segundo argumento, no embebido).
- Rama **1 móvil**: usa `movil.id` + `movil.dominio` (antes pasaba el objeto completo como `id` → `TypeError`), y navega a `/correctivos/add/movil/{id}/{dominio}`.
- Ambas rutas (`/correctivos/add/moviles` y `/correctivos/add/movil/:id/:dominio`) pasan `option="MOVIL"` a `CorrectivosAbm` (ver `Correctivos.js:19-20`).

PR #2138, commit `88814dd34`.

## Prerrequisitos

### Config en config_business
- `tickets.generacionMasiva.habilitado="true"` — verificado por API en vec-hotfix (ya ON). Sin esto NO aparecen ni los checkboxes de selección ni la llave `fa-wrench` "Crear Correctivos" en la grilla de Vehículos.

### Datos de prueba
- Tener en la grilla de Vehículos al menos 2 móviles seleccionables (para CA1 multi-móvil) y 1 móvil para el caso individual (CA2).

### Permisos
- Perfil con acceso al módulo Vehículos y a la creación de correctivos.

## Endpoints usados
| Método | Endpoint | Para qué |
|---|---|---|
| POST | `/public/auth/login` | Obtener token de autenticación |
| GET | (config) | Verificar `tickets.generacionMasiva.habilitado` en vec-hotfix |

Nota: la validación fue por **UI/Playwright**, no por API de negocio. El submit real (`POST /tickets/generacionMasiva`) queda como cobertura futura (OBS-02).

## Casos de prueba

| CA | Escenario | Resultado | Observación |
|---|---|---|---|
| Prerreq | Checkboxes de generación masiva presentes en la grilla (config ON) | ✅ PASS | Verificado por API (config ON) + UI (checkboxes visibles) |
| CA1 | **EL FIX (multi-móvil):** seleccionar 2 móviles → llave "Crear Correctivos" → el `Select` multi `#moviles` queda poblado | ✅ PASS | `Select--multi` con `has-value`, 2 chips de dominios, `is-disabled`. Antes salía vacío |
| CA2 | **Rama 1 móvil:** seleccionar 1 móvil → navega a `/correctivos/add/movil/{id}/{dominio}` sin error, ABM cargado | ✅ PASS | Ya no lanza `TypeError` (antes se pasaba el objeto como id) |
| CA3 | **Regresión de grilla** (riesgo Arqueólogo VEC-3197/3198): la selección múltiple togglea el header "N Seleccionados" + la llave; grilla OK | ✅ PASS | Sin regresión en la grilla optimizada |

**Resultado: 4/4 PASS** (vec-hotfix, build `v2.13.12b`, commit `#88814dd`, branch `fixs-2-13-12b`). Validado por UI/Playwright.

## Gotchas (automatización / regresión)
- **Checkbox de fila:** usar el selector `tbody input.customCheckbox`. El header tiene un "Seleccionar Todos" con la MISMA clase, que puede venir pre-checked; anclando a `tbody` se evita agarrarlo.
- **`.click()` NO `.check()`** sobre el checkbox: es un input controlado de React con `onChange`. `.check()` es idempotente y no dispara `onChange` si el DOM ya reporta `checked` → el estado de React no se actualiza. `.click()` sí dispara el handler.
- **Llave de generación masiva:** `i.fa-wrench[title="Crear Correctivos"]`. Ojo: hay otros `fa-wrench` por fila con `title="Crear Nuevo Mantenimiento"`; anclar por el título correcto.
- **react-select v1:** la clase del multi es `Select--multi` (doble guión, NO `is-multi`). Poblado agrega `has-value`; los chips son `.Select-value-label`. Anclar el control por `label[for="moviles"]`.
- **Ruteo:** tanto `/correctivos/add/moviles` como `/correctivos/add/movil/:id/:dominio` pasan `option="MOVIL"` a `CorrectivosAbm` (`Correctivos.js:19-20`). Cualquiera de las dos rutas debe renderizar el ABM en modo MÓVIL.
- **Config gate:** si en un entorno los checkboxes/llave no aparecen, revisar `tickets.generacionMasiva.habilitado` antes de sospechar del bug.

## Spec de automatización
- `tests/VEC-3297-generacion-masiva-moviles/generacion-masiva-moviles.spec.js` (commiteable, **NO pushear** salvo indicación).

## Observaciones
- **OBS-01 — Bug latente gemelo (mismo patrón).** El mismo antipatrón (state embebido en `push({pathname,state})` / `<Redirect>` con `history` v5) existe en otros flujos:
  - `DisponibilidadReglasGrid → Abm` (el más crítico: no tiene un `GET /reglas/:id` de respaldo para recuperar el estado perdido).
  - Dashboard Operativo 2.
  - `MovilesDetail`.
  - Drill-downs de Combustibles / Infracciones.
  
  Fuera de alcance de esta card. Posible card de deuda técnica: alinear `history` a v4, o versionar/pinnear el lockfile para evitar que resuelva v5.

- **OBS-02 — Cobertura futura.** Falta cubrir:
  - Submit E2E real: `POST /tickets/generacionMasiva`.
  - Escenario `gerenciadores ON` con multi-subregión.
  - Móvil sin `base` (para validar el map de `base_eloquent.sub_region_eloquent` en `CorrectivosAbm`).

## QA Report
VEC-3442 — https://vecfleet-kanban.atlassian.net/browse/VEC-3442 (creado y transicionado a Done).
Card madre: VEC-3297 — https://vecfleet-kanban.atlassian.net/browse/VEC-3297 (NO transicionar; lo hace el usuario).
