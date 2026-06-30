---
name: qa-exec-vec-3216
description: "Ejecución QA VEC-3216 — Mostrar entidades hijas en Datos Generales de Región, Subregión y Base (módulo PP)"
metadata:
  node_type: memory
  type: project
  originSessionId: current
---

## Feature

Vista de solo lectura de entidades hijas en la sección **Datos Generales** de cada entidad de la jerarquía PP. Aplica tanto en el módulo Período de Presupuestos como en Administración, independiente de `periodoPresupuestario.habilitado`.

| Entidad | Qué muestra | Formato |
|---|---|---|
| Región | Subregiones asociadas | Chips (etiquetas, solo lectura) |
| Subregión | Bases asociadas | Chips (etiquetas, solo lectura) |
| Base | Vehículos asignados | Botón lupa → modal con tabla |

**Modal de vehículos (Base):** columnas Marca / Dominio / Unidad / Modelo, con scroll.

**Estado vacío:** si la entidad no tiene hijos, el campo muestra estado vacío (no error).

## Scope confirmado en comentarios

- Dev (Matías Sosa) propuso separar el alcance a Administración en otra card, pero quedó en scope de VEC-3216 por decisión de producto.
- CA06 fue una corrección de ajuste visual (tamaño texto/gráficas del dashboard uniforme en los 3 submódulos PP) solicitada en comentarios por Samuel Tineo, deployada y validada.

## Propuestas adicionales fuera de scope

- Chips/filas del modal clickeables para navegar a entidad hija
- Gestión de relaciones padre-hijo desde Datos Generales (alta/baja)

## Resultados QA — 6/6 PASS (UI manual)

| CA | Descripción | Resultado |
|---|---|---|
| CA01 | Región → chips de Subregiones en Datos Generales (solo lectura) | ✅ PASS |
| CA02 | Subregión → chips de Bases en Datos Generales (solo lectura) | ✅ PASS |
| CA03 | Base → placeholder "Vehículos asignados" + botón lupa | ✅ PASS |
| CA04 | Lupa abre modal con Marca / Dominio / Unidad / Modelo + scroll | ✅ PASS |
| CA05 | Estado vacío cuando entidad sin hijos | ✅ PASS |
| CA06 | Dashboard PP: texto y gráficas del mismo tamaño en los 3 submódulos | ✅ PASS |

**QA Report:** [VEC-3300](https://vecfleet-kanban.atlassian.net/browse/VEC-3300) ✅

## Documentación actualizada

- Confluence PP (ID 1567784963) — sección 6 agregada: "Entidades de la jerarquía — Datos Generales" (v3)
