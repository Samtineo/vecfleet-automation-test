# Export personalizado de tickets de factura — prefacturación (VEC-3404)

## 1. ¿Qué hace esta feature?

Agrega, en el módulo de Facturación, un **export por factura individual** (no a nivel grilla). Desde la opción "exportar" de cada factura se abre un **modal de selección de columnas** (como el export de tickets) con un **toggle "desglose de tareas"**:

- **Desglose OFF (resumido):** una fila por ticket, con totales de presupuesto. Incluye dos columnas nuevas: **Taller** y **Tipo Modelo**.
- **Desglose ON (detallado):** una fila por cada ítem de presupuesto (mano de obra y repuesto) de cada ticket, con Clasificación, Detalle, Cantidad y montos por ítem.

> El título de la card ("Formulario para Alta de Requerimiento") es engañoso: el contenido real es exportación de prefacturación.

---

## 2. Requisitos para que funcione

| Requisito | Dónde | Valor |
|---|---|---|
| Permiso `FACTURAS_EXPORTAR` | Perfil del usuario | presente (perfil 719/stineo lo tiene) |
| Config `tickets.presupuesto.tipo` | `config_business` | `detallado` (para que aparezcan columnas de repuesto) |
| Config `facturas.prefacturacion.habilitado` | `config_business` | `true` para que aparezca la columna `nroPrefacturacion` (comparación estricta `!== 'true'`) |
| Config `tickets.exportarCsv.cantidadMinima` | `config_business` | si `count(filas) > valor` → el archivo sale en CSV en vez de xlsx |
| Toggle "desglose de tareas" | Modal del export | key `tareaNombre` en `colsAExportar` |

> ⚠️ **Config master-driven:** `config_business` se sincroniza desde un Maestro y se lee desde un file cache. Editarla por DBeaver en vec-dev no persiste de forma confiable (el cron `GetConfigBusiness` la re-sincroniza desde el Maestro). Por eso los CAs que dependen de cambiar config (columna prefacturación, switch CSV) no son ejecutables en vec-dev y quedaron verificados por código.

---

## 3. Endpoints

Base: `https://vec-dev.vecfleet.io/ws/Public/index.php/api`
Auth header: `Authorization-Token: <token>`

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/facturas/exportar-tickets-personalizado/{facturaId}` | Export personalizado. Permiso `FACTURAS_EXPORTAR`. Body `colsAExportar`. Devuelve xlsx (o csv si supera el umbral). |
| GET | `/facturas/exportar-tickets-excel/{idGerenciador}[/{idRegion}/{idSubregion}]` | Export resumido legacy por gerenciador. Permiso `FACTURAS_DETALLE_EXPORTAR`. |
| GET | `/tickets/facturables/grid/{gerenciadorId}/{regionId}/{subRegionId}` | Tickets facturables (0/0 = todas las regiones). |
| POST | `/facturas` | Crear factura: `{gerenciador:{id},quincena:{id},mes:{id},anio,selectedTickets:[{id}]}`. Sin `tipo` → PREFACTURADA sin número. |

**Body POST `/facturas/exportar-tickets-personalizado/{id}`:**
```json
{ "colsAExportar": { "tallerRazonSocial": true, "tipoModelo": true, "tareaNombre": true } }
```
- Solo se EXCLUYE una columna si se manda en `false`; las ausentes quedan incluidas.
- `tareaNombre: false` → desglose OFF (quita Mano de Obra/Repuesto/Clasificación/Detalle/Cantidad).
- Whitelist `FACTURA_EXPORT_COLUMNS` (31 columnas) en `FacturasService.php`: columnas fuera de la whitelist no aparecen aunque el front las pida.

---

## 4. Comportamiento clave

| Aspecto | Detalle |
|---|---|
| Una fila por ítem (desglose ON) | tareas (MO) + ítems (repuestos) del presupuesto aprobado |
| Reconciliación | suma de montos del desglose = MO + Repuestos del ticket. Impuestos/Otros NO se itemizan (son a nivel ticket) |
| Ticket sin ítems de presupuesto | aparece en 1 fila con cabecera y desglose vacío (total 0) |
| Factura sin tickets | xlsx solo con cabecera (deja 1 fila en blanco — OBS-02) |
| Título columna `tareaNombre` | "Mano De Obra" si `trabajaConManoDeObra` + detallado (gate dual); si no, "Tarea" |

---

## 5. Config y datos en vec-dev (al momento del QA)

| Campo | Valor |
|---|---|
| Entorno | `vec-dev.vecfleet.io` |
| `tickets.presupuesto.tipo` | `detallado` |
| `facturas.prefacturacion.habilitado` | ausente / ≠ true (columna nroPrefacturacion no aparece por default) |
| `tickets.exportarCsv.cantidadMinima` | `1000000` (CSV solo con +1M filas) |
| Gerenciador de prueba | CULASSO (id 14) — tiene ~30 tickets facturables |
| Tickets de prueba usados | 495 (MO+rep+imp+otros), 473 (MO+rep), 283 (solo MO), 314 (sin ítems) |
| Usuario con permiso | stineo (perfil 719) |

> Los datos de prueba (facturas creadas) se eliminaron al cerrar — entorno restaurado. Para regresión, recrear factura con `POST /facturas` usando tickets facturables de CULASSO.

---

## 6. Casos de prueba — VEC-3404

| CA | Descripción | Resultado | Observaciones |
|---|---|---|---|
| CA1 | Resumido + columnas Taller/Tipo Modelo + totales por ticket | ✅ PASS | Columnas presentes; valores dependen del dato del ticket/móvil |
| CA2 | Detallado: 1 fila por ítem + montos | ✅ PASS | Reconciliación OK (desglose = MO+REP) |
| CA3 | Ticket sin ítems de presupuesto | ✅ PASS | 1 fila, desglose vacío, total 0 |
| CA4 | Selección de columnas + whitelist | ✅ PASS | `false` excluye; fuera de whitelist no aparece |
| CA5 | Permiso `FACTURAS_EXPORTAR` — happy path | ✅ PASS | con permiso → 200 |
| CA5neg | 403 sin permiso | 🔵 Code-verified | `ValidatePermissionsMiddleware`; no ejecutado empíricamente |
| CA6 | Columna nroPrefacturación según config | 🔵 Code-verified | estado "off" empírico; "on" no ejecutable (config master-driven) |
| CA7 | Switch xlsx→CSV por umbral | 🔵 Code-verified | no ejecutable (config master-driven) |
| CA8 | Factura sin tickets | ✅ PASS | xlsx solo cabecera (OBS-02: 1 fila en blanco) |
| CA9 | No-regresión export legacy | ✅ PASS | `exportar-tickets-excel` consistente |

**Ejecución:** 2026-06-29 — 7/9 PASS + 2 code-verified. QA Report: **VEC-3423** (Finalizada).

---

## 7. Observaciones

| OBS | Descripción | Severidad |
|---|---|---|
| OBS-04 | Columna **Tipo Modelo** salió vacía para un ticket cuyo móvil resuelve a tipo SEDAN en el detalle. El query hace el JOIN correcto a `modelo_tipos`; causa probable: FK `modelos.tipo` null para ese modelo. **A confirmar por dev** (afecta Scenario 01). | Media |
| OBS-02 | Factura vacía deja 1 fila en blanco al final del archivo. | Baja (cosmético) |
| OBS-03 | La grilla de facturas del front no muestra el ID de la factura. | Baja (usabilidad) |
| OBS-05 | Un ítem-repuesto nombrado "Mano de Obra Default" cae en la columna Presup. M. de Obra del desglose (probable dato de prueba mal nombrado). | Baja |

---

## 8. Gotchas técnicos

- **Prefactura sin número:** `POST /facturas` sin `tipo` → nace PREFACTURADA y sin `numero`/`fecha` (esperado). No buscar prefacturas por número.
- **Visibilidad de prefacturadas:** la grilla oculta PREFACTURADAS si el usuario no tiene `FACTURAS_VER_PREFACTURADAS`; y filtra por gerenciador del usuario si no es `USUARIO_SUPERADMIN`.
- **Reasignar ticket CERRADO** (ej. asignar taller) → 409 por `ValidarEstadoTicketMiddleware`.
- **Parseo xlsx:** las celdas vacías se omiten; mapear por la referencia `r` de cada celda (no por orden), porque el resumido y el detallado tienen distinto set de columnas y los índices se corren.
