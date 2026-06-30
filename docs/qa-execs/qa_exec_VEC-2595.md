---
name: qa-exec-vec-2595
description: "Prerrequisitos, endpoint, permiso y gotchas para regresión de VEC-2595 Comentarios con trazabilidad en Checklists"
metadata:
  node_type: memory
  type: project
  originSessionId: fddf5493-1cbd-4827-9450-1f1d7cb5ca38
---

## Feature
Agregar un comentario opcional al momento de validar un formulario de checklist. El comentario queda asociado con usuario y fecha/hora. Un único comentario por formulario (post-validación no implementado — descartado del alcance).

## Prerrequisitos

| Item | Valor |
|---|---|
| Entorno | vec-dev |
| Auth | `POST /api/public/auth/login` → `resp.usuario.token` |
| Permiso | `CHECKLIST_COMENTAR` — agregado al perfil 719 durante QA |
| Módulo UI | Administración → Checklists (visible en vec-dev con stineo) |

## Endpoints relevantes

```
POST /api/formulario/{id}/validar
Authorization-Token: <token>
Content-Type: application/json

{ "comentario": "texto opcional" }
```

- Guarda el comentario solo si el usuario tiene `CHECKLIST_COMENTAR`. Sin el permiso, se ignora silenciosamente (200 OK, campo null).
- Los campos se guardan: `comentario`, `comentario_usuario_id`, `comentario_fecha_hora`

```
GET /api/formulario/{id}
```
- Devuelve `comentario`, `comentario_usuario_id`, `comentario_fecha_hora` y la relación `comentario_usuario` (objeto usuario con `usuario` y `id`).

```
PUT /api/formulario/{id}
```
- Descarta explícitamente los campos de comentario — inmutable post-validación.

```
POST /api/formulario/exportar-excel
{ "tipoFormulario": <id>, "colsAExportar": { "comentario": true }, "fechaDesde": "YYYY-MM-DD", "fechaHasta": "YYYY-MM-DD" }
```
- Columna "Comentario" aparece cuando `colsAExportar.comentario: true`.
- **Requiere `fechaDesde`/`fechaHasta`** — sin ellos Carbon usa "hoy" y excluye formularios anteriores.

## Casos de prueba

| CA | Tipo | Descripción | Resultado |
|---|---|---|---|
| CA1 | UI | Campo de comentario visible en modal al validar | ✅ PASS |
| CA2 | API | Comentario guardado con usuario y timestamp (con permiso) | ✅ PASS |
| CA3 | API | Sin permiso → comentario ignorado silenciosamente (200 OK, campo null) | ✅ PASS |
| CA4 | API | PUT descarta campos de comentario | ✅ PASS |
| CA5 | API | GET devuelve los 3 campos + relación comentario_usuario | ✅ PASS |
| CA6 | API | Exportación con columna Comentario cuando `colsAExportar.comentario: true` | ✅ PASS |
| CA7 | API | Exportación sin columna cuando `colsAExportar.comentario: false` | ✅ PASS |
| CA8 | UI | Comentario visible en detalle del formulario (sección "Validación Manual") | ✅ PASS (re-test 2026-05-30) |

## Gotchas

- **Permiso silencioso:** sin `CHECKLIST_COMENTAR`, el endpoint retorna 200 pero no guarda el comentario. No hay 403.
- **Export requiere fechas:** `fechaDesde`/`fechaHasta` son obligatorios en la práctica; sin ellos se filtran formularios de días anteriores.
- **CA8 resuelto:** Fix en PR #2028 (commit 3f8e5be41, 2026-05-28) — `FormularioAbm.js` ahora muestra el comentario en "Validación Manual". Re-testeado y confirmado PASS 2026-05-30.
- **Scope confirmado:** un único comentario por formulario, al momento de validar. Post-validación descartado.
- **UI re-login necesario:** si se cambia el permiso del perfil durante una sesión activa, el usuario debe cerrar sesión y volver a ingresar para que el frontend refleje el nuevo permiso.

## Resultados QA

8/8 PASS ✅ — QA Report: [VEC-3237](https://vecfleet-kanban.atlassian.net/browse/VEC-3237). VEC-2595 → Finalizada (2026-05-30).

→ Ver conocimiento del módulo en [[module-formularios]]
