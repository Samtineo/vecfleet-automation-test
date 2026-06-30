---
name: qa-exec-VEC-3404
description: "QA exec VEC-3404: export personalizado de tickets de una factura (prefacturación) con desglose. 7/9 CAs PASS + 2 code-verified. Endpoints, gotchas y observaciones."
metadata:
  node_type: memory
  type: project
  originSessionId: current
---

# VEC-3404 — Export personalizado de tickets de factura (prefacturación)

**Título engañoso:** la card se llama "Formulario para Alta de Requerimiento" pero el contenido real es **exportación en prefacturación** (columnas Taller + Tipo Modelo + export detallado por ítem). Componente: Facturas. Asignada a Sofia Vigliaccio.

## Datos de prueba en vec-dev (reubicado de module_facturacion al consolidar a El Motor, 2026-06-30)
- Gerenciador **CULASSO ID 14** (usado en exports de prefacturación por gerenciador).
- Tickets de prueba de export: **473, 283, 314**.

## Definición final (comentario de Sofia 2026-06-29, prevalece sobre los CAs originales)
NO son dos botones resumido/detallado. Es un **export por fila de factura** que abre un **modal** (como el export de tickets) para elegir columnas, con un **toggle "desglose de tareas"**. El export **no está a nivel grilla**, está en la opción exportar de **cada factura individual** (OBS de comportamiento, no bug).

## Endpoint
`POST /api/facturas/exportar-tickets-personalizado/{facturaId}`
- Body: `colsAExportar = { <columna>: bool }`. Permiso **`FACTURAS_EXPORTAR`** (ValidatePermissionsMiddleware, FacturasController:155).
- Toggle "desglose de tareas" = key **`tareaNombre`**. Con `tareaNombre:false` se quitan las 4 columnas de desglose (repuestoNombre/clasificacionRepuesto/detalleRepuestoTarea/cantidad). Ausente o true → desglose ON.
- Trim: solo se quita una columna si se manda `false`; las **ausentes quedan**. El front manda todas con true/false.
- Whitelist `FACTURA_EXPORT_COLUMNS` (31 cols) en `FacturasService.php:33`: columnas fuera de la whitelist NO aparecen aunque el front las pida.
- Export legacy (resumido por gerenciador): `GET /api/facturas/exportar-tickets-excel/{idGerenciador}[/{idRegion}/{idSubregion}]` (permiso `FACTURAS_DETALLE_EXPORTAR`).

## Configs que gatean (verificadas en vivo en vec-dev)
- `tickets.presupuesto.tipo` = **detallado** (vec-dev). Si ≠ detallado: se quitan columnas de repuesto aunque pidas desglose.
- `facturas.prefacturacion.habilitado` = **ausente/≠true** (vec-dev) → columna `nroPrefacturacion` ausente. Comparación estricta `!== 'true'`.
- `tickets.exportarCsv.cantidadMinima` = **1000000** (vec-dev) → switch a CSV solo con +1M filas (no testeable con volumen normal).
- Gate dual de rótulo: `trabajaConManoDeObra.habilitado` + detallado → columna `tareaNombre` se titula **"Mano De Obra"** (no "Tarea"). Confirmado ON en vec-dev.
- `motivosExtra`: la whitelist descarta sus columnas → inocuo.

## Resultados (9 CAs)
- **CA1** resumido + Taller/Tipo Modelo + totales → PASS (4 tickets→4 filas; totales correctos).
- **CA2** detallado: 1 fila por ítem + montos → PASS. Reconciliación: suma de montos del desglose = MO+REP del ticket (impuestos/otros NO se itemizan, son a nivel ticket). Ej. ticket 495: 5 tareas MO=1800 + 2 ítems repuesto=2000 → 3800 en desglose.
- **CA3** ticket sin ítems de presupuesto → PASS (aparece 1 fila, desglose vacío, total 0).
- **CA4** selección de columnas + whitelist → PASS (`false` excluye; columnas fuera de whitelist no aparecen).
- **CA5** permiso: happy path PASS (stineo con `FACTURAS_EXPORTAR` → 200). 403 negativo: **code-verified** (no se hizo empírico, requiere usuario sin el permiso).
- **CA6c/CA6d** (columna nroPrefacturacion según `prefacturacion.habilitado`) → **code-verified**, no ejecutable: config master-driven (ver gotcha).
- **CA7** (xlsx→CSV por `exportarCsv.cantidadMinima`) → **code-verified**, no ejecutable: idem config.
- **CA8** factura vacía → PASS (sin error; OBS-02: deja 1 fila en blanco).
- **CA9** no-regresión export legacy → PASS.

## Observaciones
- **OBS-04 (DEPRECADA — decisión del usuario: cerrar la card así):** la columna Tipo Modelo salió vacía para ticket 495 aunque el detalle muestra tipo SEDAN. El export hace el JOIN correcto a `modelo_tipos`; probable dato de prueba (FK `modelos.tipo` null en vec-dev). **No se persigue, no es acción de nadie.** Registro histórico únicamente.
- **OBS-02 (menor):** factura sin tickets → header + 1 fila en blanco (cosmético).
- **OBS-03 (usabilidad):** la grilla de facturas del front no muestra el ID de la factura.
- **OBS-05 (menor):** un ítem-repuesto nombrado "Mano de Obra Default" cae en la columna Presup. M. de Obra del desglose aunque suma a REP en cabecera. Probable dato de prueba mal nombrado.
- **OBS-01 (cerrada OK):** los nombres del desglose (Mano de Obra/Repuesto/Clasificación/Detalle) se ven bien en la UI (verificado por el usuario). Mi parseo de columnas xlsx se desalineaba.

## Gotchas técnicos
- **Config master-driven + file cache:** `ConfigBusiness::get()` lee un **file cache** (`config/config-business.php`), no la DB. La tabla local `config_business` (cols `seccion/grupo/subgrupo/parametro/valor`) se **sincroniza desde un Maestro** (`parametros_clientes` de la DB central) por el cron `GetConfigBusiness` (endpoint `POST /crons/get-config-business`), que hace `updateOrInsert` y **pisa ediciones locales**. → Cambiar config por DBeaver NO persiste/NO toma efecto sin refrescar cache, y el refresh re-sincroniza desde el Maestro. Por eso CA6/CA7 quedaron no ejecutables en vec-dev. Ver [[module-facturacion]].
- **Prefactura sin número:** crear factura **sin `tipo`** → nace **PREFACTURADA y sin `numero`/`fecha`** (solo se persisten con `tipo`, y ahí pasa a PENDIENTE). No buscar prefacturas por número.
- **Visibilidad de prefacturadas:** la grilla oculta PREFACTURADAS si el usuario no tiene `FACTURAS_VER_PREFACTURADAS` (FacturasRepository::grid). Y filtra por gerenciador del usuario si no es `USUARIO_SUPERADMIN`.
- **Crear factura por API:** `POST /facturas` con `{gerenciador:{id}, quincena:{id}, mes:{id}, anio, numero, fecha, selectedTickets:[{id:N}]}`. `selectedTickets` = array de `{id}`. Tickets facturables: `GET /tickets/facturables/grid/{gerenciadorId}/{regionId}/{subRegionId}` (0/0 = todas). Borrar factura libera los tickets (factura→NULL).
- **Reasignar ticket CERRADO** (ej. asignar taller) → 409 por `ValidarEstadoTicketMiddleware` salvo bypass de permisos.

## QA Report Jira
**VEC-3423** (Tarea, label "test", linkeada a VEC-3404). Publicada 2026-06-29 con OBS-04 incluida para dev. Ver [[feedback-jira-qa-report-format]].
