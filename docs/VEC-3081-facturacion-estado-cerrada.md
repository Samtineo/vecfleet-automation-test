# Facturación — Estado CERRADA como etapa final (VEC-3081)

## 1. ¿Qué hace esta feature?

Incorpora el estado `CERRADA` como etapa final opcional del flujo de facturación. Una factura en estado `PAGADA` puede cerrarse si la configuración lo permite y, opcionalmente, si tiene un adjunto con una categoría específica. El estado `CERRADA` es terminal: no puede revertirse.

---

## 2. Requisitos para que funcione

| Requisito | Dónde configurar | Valor |
|---|---|---|
| Config `facturas.cambiosEstados.CERRAR.habilitado` | `config_business` en DB | `true` |
| Config `facturas.cambiosEstados.CERRAR.categoria` | `config_business` en DB | ID de categoría de adjunto (ej. `9` para TEST) |
| Permiso `FACTURAS_CERRAR` | Perfil del usuario | debe estar presente |
| Factura en estado `PAGADA` | Estado previo requerido | — |
| Adjunto con la categoría configurada | Subido a la factura | solo si `categoria` está seteada |

> ⚠️ **Casing crítico:** el path de config es `facturas.cambiosEstados.CERRAR.habilitado` (mayúsculas en `CERRAR`). `ConfigBusiness::resolvePath()` es case-sensitive. Si el subgrupo se guarda como `cerrar`, el config retorna `null` y el endpoint devuelve `cerrar_no_habilitado`.

---

## 3. Endpoints

Base: `https://vec-dev.vecfleet.io/ws/Public/index.php/api`  
Auth header: `Authorization-Token: <token>`

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/facturas/{id}/cerrar` | Cierra la factura. Requiere `FACTURAS_CERRAR`. |
| POST | `/facturas/adjuntos` | Sube archivo. Campo multipart: `file[]`. Devuelve `{ id, nombre, ... }`. |
| PUT | `/facturas/{id}/adjuntos` | Vincula adjunto a factura con categoria. Ver body abajo. |
| GET | `/facturas/{id}` | Detalle de la factura (incluye `estado`). |
| GET | `/facturas/grid?page=0&perPage=20&length=20&start=0` | Grid de facturas (columna `estado` visible). |

**Body PUT `/facturas/{id}/adjuntos`:**
```json
{
  "adjuntos": [
    {
      "id": "<adjunto_id>",
      "nombre": "<nombre_archivo>",
      "extension": "pdf",
      "categoria": { "id": 9 }
    }
  ]
}
```

> ⚠️ El PUT reemplaza toda la lista de adjuntos. No omitir adjuntos preexistentes si no querés borrarlos.

**Upload adjunto (PowerShell):** Usar `System.Net.Http.HttpClient` — el boundary manual falla.

---

## 4. Errores conocidos del endpoint

| Código HTTP | Body | Causa |
|---|---|---|
| 400 | `cerrar_no_habilitado` | Config `CERRAR.habilitado` es `false` o `null` (revisar casing) |
| 400 | `no_se_puede_cerrar_estado_invalido` | Factura no está en estado `PAGADA` |
| 400 | `adjunto_requerido_para_cerrar` | Falta adjunto con la categoría configurada |
| 200 | `[]` | ⚠️ Bug CA8: usuario sin `FACTURAS_CERRAR` — debería ser 403 (ver sección 7) |
| 200 | `"Factura cerrada correctamente"` | Éxito |

---

## 5. Config en vec-dev

| Campo | Valor |
|---|---|
| Entorno | `vec-dev.vecfleet.io` |
| Config `CERRAR.habilitado` | `true` (corregido casing en DBeaver, 2026-05-11) |
| Config `CERRAR.categoria` | `9` (categoría "TEST") |
| Factura de prueba | ID 7 (estado actual: `CERRADA`) |
| Usuario con permiso | USUARIOTEST, perfil 736 |
| Usuario sin permiso | stineo (perfil 719), USUARIOTEST (perfil 735) |

---

## 6. Casos de prueba — VEC-3081

| CA | Descripción | Resultado | Observaciones |
|---|---|---|---|
| CA1 | Cerrar factura PAGADA con config habilitada y adjunto correcto | ✅ PASS | Factura 7 → CERRADA |
| CA2 | Intentar cerrar con config deshabilitada | ✅ PASS | HTTP 400 `cerrar_no_habilitado` |
| CA3 | Intentar cerrar factura en estado APROBADA | ✅ PASS | HTTP 400 `no_se_puede_cerrar_estado_invalido` |
| CA4 | Estado CERRADA visible en detalle y grid | ✅ PASS | Detalle y grid muestran `CERRADA` |
| CA5 | Flujo de facturación normal no se altera con config deshabilitada | ✅ PASS | Sin impacto en flujo existente |
| CA6 | Adjunto con categoría incorrecta no permite cerrar | ✅ PASS | HTTP 400 `adjunto_requerido_para_cerrar` |
| CA7 | Sin adjunto no permite cerrar | ✅ PASS | HTTP 400 `adjunto_requerido_para_cerrar` |
| CA8 | Usuario sin `FACTURAS_CERRAR` recibe 403 | ❌ FALLO | HTTP 200 `[]` en su lugar (ver sección 7) |
| CA9 | Cerrar factura en estado PAGADA con todos los requisitos | ✅ PASS | `"Factura cerrada correctamente"`, estado → CERRADA |

**Ejecución:** 2026-05-11 — 8/9 PASS, 1 FALLO (CA8 — bug reportado en VEC-3081 como comentario)

---

## 7. Bug CA8 — Endpoint retorna 200 para usuarios sin permiso

**Severidad:** Alta  
**Comentario en Jira:** VEC-3081 (comment ID 133531, 2026-05-11)

### Descripción
`POST /facturas/{id}/cerrar` retorna HTTP 200 con body `[]` para usuarios sin el permiso `FACTURAS_CERRAR`. La factura no cambia de estado. El comportamiento correcto es HTTP 403 Forbidden.

### Evidencia

| Usuario | Perfil | Permiso FACTURAS_CERRAR | Factura | HTTP | Body | Estado |
|---|---|---|---|---|---|---|
| stineo | 719 | ❌ No | 9 | 200 | `[]` | Sin cambio |
| stineo | 719 | ❌ No | 1 | 200 | `[]` | Sin cambio |
| stineo | 719 | ❌ No | 13 | 200 | `[]` | Sin cambio |
| USUARIOTEST | 735 | ❌ No | 9 | 200 | `[]` | Sin cambio |
| USUARIOTEST | 736 | ✅ Sí | 7 | 200 | `"Factura cerrada correctamente"` | → CERRADA |

### Hipótesis
`ValidatePermissionsMiddleware` es correcto en el código fuente (lanza `ForbidenException` → App.php devuelve 403). La discrepancia sugiere que el middleware no está registrado en la ruta `/facturas/{id}/cerrar` en el build desplegado, o la validación ocurre en la capa de servicio y retorna respuesta vacía en lugar de excepción.

### Estado
- [x] Detectado y documentado — 2026-05-11
- [ ] Reportado al dev (comentario en VEC-3081)
- [ ] Fix desplegado en vec-dev
- [ ] Re-ejecutar CA8 tras el fix
- [ ] Publicar QA Report completo (VEC-3081 → Finalizada)

---

## 8. Historial de bloqueos resueltos

| Bloqueo | Síntoma | Resolución |
|---|---|---|
| Casing de config `cerrar` vs `CERRAR` | CA2/5 devolvían `cerrar_no_habilitado` aun con config "habilitada" | Actualizar subgrupo en DB de `cerrar` a `CERRAR` (DBeaver, 2026-05-11) |
| `PUT /facturas/{id}/adjuntos` borra adjuntos previos | Enviar PUT sin `archivo` existente reemplaza la lista | Subir archivo real primero con `POST /facturas/adjuntos`, luego incluirlo en el PUT |
| Upload multipart con boundary manual falla en PowerShell | HTTP 500 | Usar `System.Net.Http.HttpClient` con `file[]` como field name |
