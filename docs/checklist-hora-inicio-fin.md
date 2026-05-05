# Checklist Export — Hora Inicio & Hora Fin — VEC-2998

## 1. Descripción del bug

**Reportado por:** DISGROUP  
**Síntoma:** Al exportar un checklist a Excel, las columnas "Hora Inicio" y "Hora Fin" salen vacías.  
**Causa raíz:** `FormularioController` pasa los valores de `fecha_inicio`/`fecha_fin` como strings (`Timezone::utcToLocal($item->fecha_inicio, 'Y-m-d H:i:s')`) a `ExcelService`. El método `Date::PHPToExcel()` de PhpSpreadsheet esperaba un timestamp entero o DateTime; con un string el valor resultaba vacío en la celda. Adicionalmente, el guard de formato en `ExcelService` estaba aplicando erróneamente el formato de fecha completa al formato `hh:mm` porque la regex incluía `m` (minutos).

---

## 2. Fix implementado

### Cambios en `ExcelService.php`

1. **Guard de formato corregido** (commit `531e880ce`): regex cambiada de `/[ydm]/i` a `/[yd]/i` para que el formato `hh:mm` no se reemplace por el formato de fecha completa (la `m` en la regex vieja machaba minutos, no solo meses).

2. **Soporte de string en `PHPToExcel`**: `Date::PHPToExcel()` de PhpSpreadsheet 1.x acepta strings vía `strtotime()` internamente en versiones recientes; el fix de formato es lo que permite que el valor se muestre correctamente como `hh:mm` en lugar de un serial numérico.

### Entry points afectados

| Endpoint | Método | Descripción |
|---|---|---|
| `POST /api/formulario/exportar-excel` | `FormularioController::exportarExcel` | Export principal de checklists |

---

## 3. Datos de campo en la BD

Las columnas `fecha_inicio` y `fecha_fin` de la tabla `formularios` fueron creadas por la migración `20260317124648_add_columns_fecha_inicio_fecha_fin_to_formularios_table`. Se populan al completar el formulario desde la app móvil o web con los parámetros `fecha_inicio` y `fecha_fin` del POST.

---

## 4. Casos de prueba — VEC-2998

**Entorno:** `vec-hotfix.vecfleet.io`  
**Script:** `scripts/hotfix-test-tc-2998.js`

```bash
node scripts/hotfix-test-tc-2998.js
```

| TC | Descripción | Verificación |
|---|---|---|
| TC-01 | Formularios con fecha_inicio y fecha_fin existen en el entorno | `GET /formulario/{id}` → fecha_inicio y fecha_fin no nulas |
| TC-02 | Export devuelve xlsx válido | `POST /formulario/exportar-excel` → HTTP 200, Content-Type xlsx, size > 1KB |
| TC-03 | Columnas "Hora Inicio" y "Hora Fin" presentes en el archivo | Parse xlsx → headers contienen ambas columnas |
| TC-04 | Columnas tienen valores en filas con fecha_inicio/fin | Todas las filas con data tienen hora no vacía |
| TC-05 | Formato legible HH:MM (no serial numérico ni vacío) | Valor tipo "14:44" — no un número decimal |

---

## 5. Historial de ejecuciones

| Fecha | Entorno | TC-01 | TC-02 | TC-03 | TC-04 | TC-05 |
|---|---|---|---|---|---|---|
| 2026-05-04 | vec-hotfix | PASS | PASS | PASS | PASS | PASS |
