---
name: qa-exec-vec-3152
description: "Plan, prerrequisitos, CAs y gotchas para regresión de VEC-3152 — Importador asigna Plan Preventivo pero no genera Controles"
metadata:
  node_type: memory
  type: project
  originSessionId: 83c0da0d-93de-4728-bd46-8d567dba996f
---

## Feature
El importador de vehículos (`POST /moviles/importar-excel/movil`) regenera controles preventivos cuando el plan ya está asignado en DB pero los controles fueron eliminados. Fix en `MovilRepository.php` ~línea 7016 (PR #2034).

## Fix técnico
```php
// Después de $this->update($movilR, $token, $origen):
if (!empty($plan_preventivo) && $movilR->getPlanPreventivo()) {
    $estadosActivosImport = explode(",", ConfigBusiness::get('moviles.estadosActivos'));
    if (in_array($movilR->getEstado(), $estadosActivosImport)) {
        // SELECT COUNT(*) FROM preventivos WHERE movil_id=X AND plan_mantenimiento_id=Y AND activo=1 AND fecha_hora_baja IS NULL
        // Si count=0 → crearPreventivosMoviles($movilR)
    }
}
```

## Prerrequisitos

| Item | Valor |
|---|---|
| Entorno | vec-dev |
| Auth | POST /api/public/auth/login → resp.usuario.token |
| Vehículo CA1-CA4 | RUV4G35 (ID 22, unidad_medidor_id=1, estado OPERATIVO) |
| Plan | PM TEMPLATE #01 (ID 2, medidor=1, 3 servicios activos) |
| Import endpoint | POST /api/moviles/importar-excel/movil (multipart, field "file") |

## Validación de medidor (gotcha clave)

`$movil->unidad_medidor_id != $planMantenimiento->unidad_medidor_id` → throw exception.

- Plan "Test" (ID 4): `unidad_medidor_id = null` → solo funciona con vehículos con medidor=null (ej: ID 24 SLQ2317)
- Plan "PM TEMPLATE #01" (ID 2): `unidad_medidor_id = 1` → funciona con vehículos con medidor=1 (mayoría, ej: ID 22 RUV4G35)
- Planes disponibles en vec-dev con medidor=1: ID 2 (PM TEMPLATE #01), ID 3 (PM TEMPLATE #02), ID 5 (New Test)
- Planes con medidor=null: ID 4 (Test)

## Casos de prueba

| CA | Tipo | Descripción | Resultado |
|---|---|---|---|
| CA1 | API | RUV4G35 sin plan → import con PM TEMPLATE #01 → 3 controles generados (IDs 169-171) | ✅ PASS |
| CA2 | API | RUV4G35 plan en DB, DELETE preventivos → import → 3 controles regenerados (IDs 172-174) | ✅ PASS |
| CA3 | API | RUV4G35 con controles → import nuevamente → count=3, sin duplicación | ✅ PASS |
| CA4 | API | RUV4G35 con estado FUERA DE SERVICIO → import → 0 controles (fix respeta estadosActivos) | ✅ PASS |

## Endpoints clave

```
# Import
POST /api/moviles/importar-excel/movil
Content-Type: multipart/form-data; field="file"

# Verificar controles
GET /api/preventivos/movil/{movilId}
GET /api/preventivos/{preventivoId}  → activo, plan_mantenimiento_id, servicio_id

# Soft-delete control
DELETE /api/preventivos/{id}  → sets activo=false, fecha_hora_baja

# Planes disponibles
GET /api/plan-mantenimiento-preventivos/simple-search
```

## Gotchas

- **Construcción del xlsx:** El xlsx debe tener headers completos en row 1 (todos los encabezados del importador). Row 2: solo A2=dominio + AA2=plan (limpiar otros campos evita conflictos de chasis duplicado, plan vencimiento inexistente, etc.).
- **Estado FUERA DE SERVICIO:** Válido en vec-dev (`moviles.estados` incluye este valor). No está en `moviles.estadosActivos` → fix no genera controles.
- **Vehículo 22 post-test:** Quedó con estado FUERA DE SERVICIO y plan PM TEMPLATE #01. Restaurar a OPERATIVO si se necesita para otras pruebas.
- **Importer usa System.Net.Http.HttpClient** para upload multipart en PowerShell (boundary manual falla).

## Resultados QA

4/4 PASS ✅ — QA Report: [VEC-3246](https://vecfleet-kanban.atlassian.net/browse/VEC-3246). VEC-3152 → Finalizada (2026-05-30).

→ Ver módulo en [[module-moviles]]
