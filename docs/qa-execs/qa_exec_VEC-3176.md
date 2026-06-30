---
name: qa-exec-vec-3176
description: "Prerrequisitos, endpoint, CAs y gotchas para regresión de VEC-3176 Administración de Ítems – Exportación consolidada Ítems vs Servicios"
metadata:
  node_type: memory
  type: project
  originSessionId: fddf5493-1cbd-4827-9450-1f1d7cb5ca38
---

## Feature
Exportación Excel desde la grilla de Administración de Ítems (Pañol). Botón en barra superior derecha → modal para seleccionar columnas → Excel con una fila por par ítem-servicio.

## Prerrequisitos

| Item | Valor |
|---|---|
| Entorno | vec-dev |
| Auth | `POST /api/public/auth/login` → `resp.usuario.token` |
| Módulo UI | Administración de Ítems (Pañol) — visible en vec-dev con stineo |

## Endpoint

```
POST /api/panol2/repuestos/exportar-excel
Authorization-Token: <token>
Content-Type: application/json

{
  "colsAExportar": {
    "external_code": true,
    "descripcion": true,
    "categoria": true,
    "subcategoria": true,
    "unidad": true,
    "tipo": true,
    "numero_parte": true,
    "referencia": true,
    "marca": true,
    "costo": true,
    "costo_fijo": true,
    "activo": true,
    "servicio": true
  },
  "filterQuery": {
    "descripcion": "",
    "showInactivos": "false"
  }
}
```

**Nota:** `colsAExportar` con campo en `false` omite esa columna del Excel. Objeto vacío `{}` incluye todas.

## Columnas del Excel (ES)

A: Código Externo | B: Descripción | C: Categoría | D: Sub-Categoría | E: Unidad de Medida | F: Tipo | G: Nro de Parte | H: Referencia | I: Marca | J: Costo | K: Costo Fijo | L: Estado | M: Servicio Asociado

## Casos de prueba

| CA | Tipo | Descripción | Validación |
|---|---|---|---|
| CA1 | UI | Botón visible en barra superior derecha de la grilla | Visual |
| CA2 | API | Ítem con múltiples servicios → una fila por servicio | Parsear Excel: `aromatizante` debe tener 4 filas |
| CA3 | API | Ítem sin servicios → celda M = "Sin servicio asociado" | Parsear Excel: 18 ítems sin servicio en vec-dev |
| CA4 | API | Filtro `descripcion` respetado en la exportación | Filter `aromatizante` → 4 filas exactas |
| CA5 | UI | Modal de columnas seleccionables | Visual |
| CA6 | API | Columna deseleccionada ausente del Excel | `servicio:false` → dimension A1:L55 (sin M) |
| CA7 | API | Sin token → 401 | `Unauthorized` |

## Gotchas

- **Sin permiso específico**: el endpoint no tiene `ValidatePermissionsMiddleware`. Solo requiere autenticación válida.
- **inlineStr, no sharedStrings**: las celdas de datos usan `t="inlineStr"` con `<is><r><t>...</t></r></is>`. Los headers (fila 1) usan `t="s"` con índice a sharedStrings. Importante para parsear el Excel en regresiones.
- **Bug visual conocido**: el modal muestra "Exportar Ítems vs Servicios" en lugar de "Exportar Ítems" — anotado como comentario en VEC-3176.
- **CA3**: El comentario del dev decía "celda vacía" pero el código produce "Sin servicio asociado" — correcto según spec.
- **Columnas dinámicas**: las columnas del modal dependen de `panol.items.show` del tenant. En vec-dev se muestran todas.

## Datos de prueba (vec-dev)

- Ítem con múltiples servicios: `aromatizante` (4), `Mano de Obra Default` (7), `bolsa negra para basura` (4)
- Ítems sin servicio: 18 (ej. `cloro`, `Bolsa para basura tipo gabacha`)
- Total ítems activos: ~36 | Total con inactivos: 54

## Resultados QA

7/7 PASS — QA Report: [VEC-3234](https://vecfleet-kanban.atlassian.net/browse/VEC-3234) (Finalizada).

**VEC-3176 NO cerrada** — pendiente fix del bug visual (título modal "Exportar Ítems vs Servicios" en lugar de "Exportar Ítems"). Card queda en "Deployed To Stage" hasta corrección.

→ Ver conocimiento del módulo en [[module-items]]
