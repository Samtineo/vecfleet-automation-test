---
name: qa-exec-vec-3395
description: "QA Exec para VEC-3395 — Checklist app: histórico queda cargando (spinner infinito). Bugfix de regresión. Entorno vec-hotfix."
metadata: 
  node_type: memory
  type: project
  originSessionId: 5fffe884-6bb8-4ce8-a2d3-8fdd01073888
---

## Entorno
- vec-hotfix (branch hotfix-VEC-3395, PR #2102, commit fix `c4254247b`)
- Validación funcional en app mobile contra vec-hotfix
- Reportado por cliente AB-INBEV-PA

## Síntoma
Al abrir un histórico de Checklist desde la app mobile, el spinner quedaba cargando infinito (crash silencioso, sin mensaje de error).

## Causa raíz
La optimización de performance del deploy del 22-jun (commit ERIC `53ffb5557`) agregó `valoresDinamicos` al `without([...])` del grid de formularios en `FormularioService.php`. La app accede a `formulario.valores_dinamicos` desde los **route params** al abrir un histórico; al no venir el campo, `Formulario.vue` crasheaba silenciosamente → spinner infinito.

## Fix
Se restauró `valoresDinamicos` (se quitó del `without()` del grid). Quedó comentario + **TODO**: recuperar la optimización cuando la app procese el checklist desde `initData()` en vez de route params.

## Casos de prueba

| CA | Escenario | Resultado | Observación |
|---|---|---|---|
| 01 | Abrir histórico de Checklist desde app mobile (vec-hotfix) | ✅ | Carga correctamente, sin spinner infinito. Validado por usuario en app + diff verificado |

Resultado: PASS.

## Gotchas
- La app depende de que el grid de formularios devuelva `valoresDinamicos`. No remover ese campo del `without()` del grid en `FormularioService.php` hasta que la app deje de leerlo desde route params (ver TODO en el código).
- El crash era silencioso: no había error en consola ni toast, solo spinner. Para diagnosticar regresiones similares, comparar el payload del grid contra lo que la app espera en route params.

## Nota — Cluster de regresiones del `without()` (deploy 22-jun)
Tercera regresión del mismo `without([...])` introducido por la optimización del commit ERIC `53ffb5557`:
- **VEC-3393** — gridCount
- **VEC-3394** — usuario_modificacion
- **VEC-3395** — valoresDinamicos (esta card)

Patrón: la optimización removió datos que el detalle / la app necesitaban. Revisar el resto de los campos del `without()` ante futuras regresiones del grid de formularios.

## QA Report
VEC-3395 — https://vecfleet-kanban.atlassian.net/browse/VEC-3395
