---
name: qa-exec-vec-3187
description: "Prerrequisitos, CAs y gotchas para regresión de VEC-3187 Copyright footer rango dinámico (2018—año actual)"
metadata:
  node_type: memory
  type: project
  originSessionId: fddf5493-1cbd-4827-9450-1f1d7cb5ca38
---

## Feature
Actualiza el año del copyright del footer de la plataforma web al formato de rango dinámico `2018—{año actual}`. La implementación usa `new Date().getFullYear()` en React — se actualiza sola cada año calendario sin intervención manual.

## Prerrequisitos

| Item | Valor |
|---|---|
| Entorno | vec-dev o Staging |
| Scope | Plataforma web únicamente (no aplica a mobile, PDFs ni exports) |
| Flag | `showCopyright` — controla visibilidad del footer |

## Implementación

- `vec-fleet-web/src/components/layout/Layout.js:954` — `© 2018—{new Date().getFullYear()}`
- Condicionado por flag `showCopyright`
- Alcanza a todos los módulos y páginas web vía Layout global

## Casos de prueba

| CA | Descripción | Validación | Resultado |
|---|---|---|---|
| CA1 | Footer muestra "Copyright © 2018—2026 VecFleet" durante el año en curso | UI | ✅ PASS |
| CA2 | Año se actualiza automáticamente el 1 de enero sin intervención manual | Inspección código `Layout.js:954` → `new Date().getFullYear()` | ✅ PASS |
| CA3 | Copyright visible en todos los módulos y páginas web | UI — Layout global | ✅ PASS |

## Metodología

Feature trivial con validación UI ya hecha por el usuario. CA2 validado por inspección de código (no requiere esperar al 1/1 para confirmar el comportamiento).

> Nota de proceso: para features de este tipo (cambio visual simple ya validado en UI), no es necesaria una card QA Report separada — alcanza con comentar los resultados en la card principal.

## Resultados QA

3/3 PASS. QA Report: [VEC-3228](https://vecfleet-kanban.atlassian.net/browse/VEC-3228) — Finalizada ✅. VEC-3187 → Finalizada ✅.
