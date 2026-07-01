---
name: qa-exec-vec-3430
description: "QA Exec para VEC-3430 — Herencia automática: correctivos manuales y forzado de Prev/Venc. Bug fix de VEC-3235. Entorno vec-dev."
metadata:
  type: project
---

# VEC-3430 — Herencia automática: Correctivos manuales y Forzado de Prev/Venc

Bug fix de VEC-3235. Commit `0ad5a5e09` (PR #2141, develop). Entorno vec-dev. QA Report VEC-3447. Resultado 8/8 CAs PASS.

## Los 2 fixes

- **P1 (Correctivo):** el backend NUNCA heredó en correctivos (`TicketsRepository::create` L375-383 solo attacha ítems del usuario). El fix es de UI en `vec-fleet-web/src/components/servicios/ServiciosAbm.js`: el toggle "Herencia automática" (L699/746) ahora solo se muestra si el tipo es PREVENTIVO/VENCIMIENTO, y `handleSelectFormChange` (L376-379) fuerza `heredar=true` para otros tipos.
- **P2 (Forzado):** guards `getHeredarRepuestos()`/`getHeredarManoObra()` agregados a `generateTicketForzado` de Preventivos (`PreventivosRepository.php` L726/750) y Vencimientos (`VencimientosRepository.php` L1383/1397). Antes el forzado heredaba siempre; ahora respeta el flag.

## Entorno

- Base: vec-dev.
- Auth: `POST /public/auth/login` con `{stineo/susy1234}`; token en header `Authorization-Token`.
- El runtime lee la tabla `config_business` en vivo (RAM → file cache → DB). Se pueden habilitar features por SQL directo: `UPDATE` si la fila existe, o `INSERT` si no (el gate de herencia no tenía fila → caía al sample=false). El sync del maestro puede revertirlo con el tiempo.

## Prerrequisitos

**Datos de prueba (vec-dev):**
- Móvil 5 (`SDFJ-19-2`).
- Servicios: 37 / 1048 (PREVENTIVO), 1071 (VENCIMIENTO), 4 (CORRECTIVO `CARTER`), todos con ítem Producto + Mano De Obra.

**Setear flags de herencia:**
- Los flags `heredar_repuestos` / `heredar_mano_obra` se setean por **SQL directo** en la tabla `servicios` (NO por API: INC-005, `PUT /servicios` con JSON se ignora).

**Config a habilitar (por SQL directo en `config_business`):**
- `servicios.herenciaRepuestosManoDeObra.habilitado = true`
- `servicios.repuestos.habilitado = true`

**Permiso en el perfil de prueba:**
- `SERVICIOS_MODIFICAR_HERENCIA_ITEMS`

## Endpoints usados

| Método | Endpoint | Para qué |
|---|---|---|
| POST | `/public/auth/login` | Autenticación (token en header `Authorization-Token`) |
| POST | `/api/crons/generacion-tickets-preventivos` | Cron de generación automática |
| POST | `/api/preventivos/forzar/{controlId}` | Forzar control (`{detalle}` → 204, genera ticket) |
| GET | `/api/preventivos/movil/{movilId}` | Listar controles forzables (ids 180-183 para móvil 5 / servicio 37) |
| GET | `/api/tickets/moviles/{movilId}/grid` | Ver ticket generado (el más nuevo) |
| GET | `/api/items/items-and-servicio-by-ticket/{ticketId}` | Verificar ítems heredados |
| POST | `/api/tickets` | Crear ticket correctivo manual (CA01) |

## Casos de prueba

| CA | Escenario | Método | Resultado | Observación |
|---|---|---|---|---|
| 01 | Correctivo manual no hereda | empírico, ticket 875 (POST /tickets CORRECTIVO servicio 4) | ✅ | 0 heredados |
| 02 | Forzado Heredar=No → no hereda (fix P2) | empírico, servicio 37=0/0, forzar 182 → ticket 873 | ✅ | 0 ítems |
| 03 | Forzado Heredar=Sí → hereda ambos | empírico, 37=1/1, forzar 181 → ticket 872 | ✅ | Producto + MO |
| 04 | Forzado Rep=Sí/MO=No → solo repuesto | empírico, 37=1/0, forzar 183 → ticket 874 | ✅ | solo Producto |
| 05 | Automática sin regresión | cron → ticket 871 + código (paths sin cambios desde VEC-3235) | ✅ | |
| 06 | Vencimiento/GESTORIA forzado | code-verified (VencimientosRepository L1383/1397, guard idéntico) | ✅ | |
| 07 | Borrador VEC-3231 con Heredar=No | code-verified (borrador off en vec-dev; el filtro se propaga porque el borrador lee `ticket_items`) | ✅ | |
| 08 | UI: toggle solo Prev/Venc | empírico Playwright `tests/VEC-3430-herencia-ui/` 3/3: servicio 1048(PREV)=2 toggles, 1071(VENC)=2, 4(CORR)=0 | ✅ | |

## Gotchas

- **INC-005:** `PUT /servicios` con JSON se ignora (204 sin guardar) → setear `heredar_*` por SQL o urlencoded.
- **Servicio 37** (`--SERVICIO DEFAULT--`) está `activo=false` y su `ticketTipo` puede no resolver a tiempo en el ABM; para el test de UI usar 1048 (PREVENTIVO activo).
- El toggle de UI requiere `servicios.herenciaRepuestosManoDeObra.habilitado=true` **Y** `servicios.repuestos.habilitado=true`, más el permiso `SERVICIOS_MODIFICAR_HERENCIA_ITEMS`.
- **Config en vec-dev:** el runtime lee la tabla `config_business` en vivo (RAM → file cache → DB). Se pueden habilitar features por SQL directo: `UPDATE` si la fila existe, o `INSERT` si no (el gate de herencia no tenía fila → caía al sample=false). El sync del maestro puede revertirlo con el tiempo.

## Observaciones no bloqueantes

- **Candidata INC-007:** el toggle depende de `herenciaRepuestosManoDeObra` pero la herencia real también requiere `trabajaConRepuestos` / `trabajaConManoDeObra` (fallo silencioso config-dependiente, pre-existente).
- **Side-finding (otra card):** `GET /preventivos/grid` responde 500 en vec-dev (SQLSTATE 42000, 'offset 0', pagination sin limit).

## QA Report

VEC-3447 — https://vecfleet-kanban.atlassian.net/browse/VEC-3447
