---
name: qa-exec-vec-3081
description: "Camino completo de ejecución regresiva para VEC-3081 Facturación estado CERRADA — prerrequisitos, pasos API, assertions y gotchas"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3ba4e115-0704-4be3-b075-1acfc8cfa7db
---

## Feature
Estado `CERRADA` como etapa final opcional del flujo de facturación. Se accede vía `POST /facturas/{id}/cerrar`. Requiere config habilitada, factura en estado `PAGADA`, adjunto con categoría correcta y permiso `FACTURAS_CERRAR`.

## Prerrequisitos

| Item | Valor |
|---|---|
| Config | `facturas.cambiosEstados.CERRAR.habilitado = true` (mayúsculas importantes) |
| Config categoría | `facturas.cambiosEstados.CERRAR.categoria = 9` (categoría "TEST") — **no dejar vacío, bypassea la validación** |
| Entorno | vec-dev |
| Usuario con permiso | stineo — perfil 719 ✅; USUARIOTEST — perfil 736 ✅ |
| Usuario sin permiso | USUARIOTEST — perfil 735 |
| Factura de prueba | ID 7 y ID 22 CERRADAS — usar otra PAGADA para futuros runs |
| Auth | `POST /public/auth/login` → `resp.usuario.token` |

**Nota:** las facturas CERRADAS son terminales. Para re-ejecutar CA1/CA9 hace falta una nueva factura en estado PAGADA.

## Flujo de ejecución happy path (CA1 / CA9)

### 1. Login con usuario con permiso
```
POST /public/auth/login
Body: { "usuario": "USUARIOTEST", "clave": "<clave>" }  // perfil 736
→ 200, guardar token
```

### 2. Subir adjunto con categoría correcta (categoría 9)
```
POST /facturas/{id}/adjuntos
Content-Type: multipart/form-data
Body: archivo + categoria_id=9
→ 200
```

### 3. Cerrar la factura
```
POST /facturas/{id}/cerrar
Authorization-Token: <token_con_permiso>
→ 200, body: "Factura cerrada correctamente"
```

### 4. Verificar estado CERRADA
```
GET /facturas/{id}
→ 200, estado = "CERRADA"
```

## Casos de borde validados

| CA | Descripción | Request | Respuesta esperada |
|---|---|---|---|
| CA2 | Config deshabilitada | POST /cerrar con `habilitado=false` | 400 `cerrar_no_habilitado` |
| CA3 | Estado incorrecto (APROBADA) | POST /cerrar sobre factura APROBADA | 400 `no_se_puede_cerrar_estado_invalido` |
| CA5 | Flujo normal no se altera | Crear/procesar factura normal con config off | No afecta flujo existente |
| CA6 | Adjunto categoría incorrecta | POST /cerrar sin adjunto categoría 9 | 400 `adjunto_requerido_para_cerrar` |
| CA7 | Sin adjunto | POST /cerrar sin ningún adjunto | 400 `adjunto_requerido_para_cerrar` |
| CA8 ❌ | Sin permiso FACTURAS_CERRAR | POST /cerrar con usuario sin permiso | **Esperado 403 — ACTUAL 200 `[]` (bug conocido)** |

## Gotchas críticos

- **CA8 es deuda técnica**: el endpoint retorna HTTP 200 con body `[]` en lugar de 403 para usuarios sin permiso. La factura no cambia de estado (efecto silencioso). Bug reportado en VEC-3081 comment ID 133531.
- **Casing en config**: la clave es `facturas.cambiosEstados.CERRAR.habilitado` — el `CERRAR` en mayúsculas es obligatorio.
- **Config `categoria` vacía = bypass silencioso**: si `CERRAR.categoria = ""` (string vacío), el backend lo evalúa como falsy y omite la validación del adjunto por completo. Una factura se puede cerrar sin adjunto. Bug detectado y reportado 2026-06-01 (factura 26 fue cerrada sin adjunto en prod).
- **Adjunto requerido solo si categoria está seteada**: con categoría configurada, sin adjunto de esa categoría el endpoint rechaza con `adjunto_requerido_para_cerrar`.
- **Subir adjunto via API para CA1**: el "Guardar adjunto" debe hacerse desde el front (o usar el flujo correcto de frontend). El PUT /facturas/{id}/adjuntos vía API directa no persiste adjuntos subidos también por API puro (bug de contexto de DB). Ver [[module-facturacion]].
- **Estado previo**: la factura debe estar en `PAGADA` para poder cerrarla. APROBADA falla.
- **Reset necesario**: cada run exitoso consume la factura (pasa a CERRADA). Necesita nueva factura PAGADA para re-ejecutar CA1/CA9.

## Resultados QA

| CA | Resultado |
|---|---|
| CA1 | ✅ PASS |
| CA2 | ✅ PASS |
| CA3 | ✅ PASS |
| CA4 | ✅ PASS (estado CERRADA visible en detalle y grid) |
| CA5 | ✅ PASS |
| CA6 | ✅ PASS |
| CA7 | ✅ PASS |
| CA8 | ❌ FALLO — deuda técnica |
| CA9 | ✅ PASS |

**QA Report:** VEC-3165 (Tarea, label "test", link "Test" a VEC-3081). VEC-3081 → Finalizada.

## Regresión 2026-06-01 — Bug `categoria` vacía

**Contexto:** Se reportó que factura 26 fue cerrada sin adjunto. Causa: `CERRAR.categoria = ""` en config-business, bypasseando la validación. Config corregida a `"9"`.

| CA | Descripción | Resultado |
|---|---|---|
| CA7 | Cerrar sin adjunto con config fix aplicado | ✅ PASS — HTTP 400 `adjunto_requerido_para_cerrar` |
| CA1 | Cerrar factura 22 (PAGADA) con adjunto cat 9 (IDs 1134/1135) | ✅ PASS — HTTP 200, estado → CERRADA |

## Specs de automatización
Pendiente — no se generaron specs Playwright para VEC-3081. Smoke test Postman cubre el GET del módulo.
