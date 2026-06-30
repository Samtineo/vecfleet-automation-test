---
name: qa-exec-vec-3192
description: "Camino completo de ejecución regresiva para VEC-3192 Personas | Validar formato de email — prerrequisitos, pasos API, assertions y gotchas"
metadata: 
  node_type: memory
  type: project
  originSessionId: fddf5493-1cbd-4827-9450-1f1d7cb5ca38
---

## Feature
Validación de formato de email en el ABM de Personas. Doble validación: frontend (Validator.js regex) + backend (Respect\Validation `v::email()`). Aplica tanto en la creación como en el PATCH de una persona.

## Prerrequisitos

| Item | Valor |
|---|---|
| Entorno | vec-dev |
| Usuario de prueba | `stineo` (perfil 719) |
| Persona segura para PATCH | ID 5 — Hassan Salum (`hsalum@vecfleet.io`) — sin `USUARIO_REQUIERE_LICENCIA_CONDUCIR`, sin transportadora obligatoria |
| Auth | `POST /public/auth/login` → `resp.usuario.token` |

**Nota:** evitar usar personas con perfil que tenga `USUARIO_REQUIERE_LICENCIA_CONDUCIR` o cuyo tenant tenga `personas.transportadora.obligatorio = true`. En vec-dev, casi todas las personas no-usuario tienen transportadora obligatoria. Usar persona 5 para CAs que requieren emails válidos.

## Flujo de ejecución happy path — PATCH email válido

```
PATCH /personas/5
Authorization-Token: <token>
Body: { "email": "test.qa@vecfleet.io" }
→ 200

# Restaurar al final:
PATCH /personas/5
Body: { "email": "hsalum@vecfleet.io" }
→ 200
```

## Casos de prueba

| CA | Tipo | Descripción | Request | Respuesta esperada |
|---|---|---|---|---|
| CA1 | API | Email válido en PATCH | `PATCH /personas/5` con `email: valid@mail.com` | 200 |
| CA2 | API | Email formato inválido (`prueba@`) | `PATCH /personas/5` con email sin TLD | 400 `email_invalido` |
| CA3 | API | Email formato inválido (`test..qa@mail`) | `PATCH /personas/5` con doble punto | 400 `email_invalido` |
| CA4 | API | Email formato inválido (`sinFormato`) | `PATCH /personas/5` sin @ ni dominio | 400 `email_invalido` |
| CA5 | API | Email vacío en persona IS usuario | `PATCH /personas/5` con `email: ""` | 400 `email_obligatorio_para_usuario` |
| CA6 | API | Email null en persona IS usuario | `PATCH /personas/5` con `email: null` | 400 `email_obligatorio_para_usuario` |
| CA8 | API | Email válido en creación | `POST /personas` con email válido | 200/201 |
| CA9 | API | Email inválido en creación | `POST /personas` con email inválido | 400 |
| CA11 | API | Campo email ausente en PATCH | `PATCH /personas/5` sin campo email | 200 (campo no tocado) |
| CA7 | UI | Email vacío en persona NO usuario | Abrir persona no-usuario → limpiar email → guardar | Guarda sin error |
| CA10 | UI | Mensaje de error claro y específico | Email inválido → intentar guardar → verificar texto del error | Mensaje específico sobre email |
| CA12 | UI | Email pre-existente inválido puede corregirse | Persona con email inválido en DB → editar → corregir → guardar | Guarda OK |
| CA13 | UI | Validación se dispara al blur (sin guardar) | Ingresar email inválido → Tab → sin click en Guardar | Error aparece en el campo |

## Gotchas críticos

- **Orden de validaciones en PATCH**: email inválido falla ANTES de `validarCamposObligatorios`. Emails válidos SÍ llegan a esa validación → puede fallar por licencia o transportadora si la persona tiene esos constraints. **Usar persona 5 (Hassan Salum) para CAs con emails válidos.**
- **CA7 inviable por API**: todas las personas no-usuario en vec-dev tienen `personas.transportadora.obligatorio = true`. PATCH de email vacío (válido) llega a `validarCamposObligatorios` y falla con `transportadora_obligatoria`. Validar por UI.
- **Restaurar email de persona 5**: después de CAs que modifiquen el email, ejecutar `PATCH /personas/5` con `email: hsalum@vecfleet.io` para dejar el entorno limpio.
- **`$pid` es variable reservada en PowerShell**: usar `$personaId` u otro nombre al scripting con PS.

## Resultados QA

| CA | Resultado |
|---|---|
| CA1 | ✅ PASS |
| CA2 | ✅ PASS |
| CA3 | ✅ PASS |
| CA4 | ✅ PASS |
| CA5 | ✅ PASS |
| CA6 | ✅ PASS |
| CA7 | ✅ PASS (UI) |
| CA8 | ✅ PASS |
| CA9 | ✅ PASS |
| CA10 | ✅ PASS (UI) |
| CA11 | ✅ PASS |
| CA12 | ✅ PASS (UI) |
| CA13 | ✅ PASS (UI) |

**13/13 PASS**

**QA Report:** VEC-3227 (Tarea, label "test", link "Test" a VEC-3192). VEC-3192 → Finalizada.

→ Ver conocimiento del módulo en [[module-personas]]
