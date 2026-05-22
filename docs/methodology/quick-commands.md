# Comandos Rápidos QA — VecFleet

Guía de uso de los flujos de trabajo asistidos por Claude Code para el área de QA.

---

## Contexto mínimo para sesiones nuevas

Estos comandos dependen de que Claude tenga contexto del entorno de trabajo. Al iniciar una sesión nueva, compartir este archivo con:

```
Leé docs/methodology/quick-commands.md antes de arrancar
```

Entorno de trabajo:
- **Repo de código:** `vec-fleet` (solo lectura)
- **Gestión de tareas:** Jira — `vecfleet-kanban.atlassian.net`
- **Documentación pública:** Confluence — espacio VFI, carpeta "Documentación Técnico/Funcional por Módulos"
- **Entorno de prueba por defecto:** `vec-dev.vecfleet.io`

---

## Comencemos con VEC-XXXX

**Cuándo usarlo:** Siempre que se va a ejecutar QA sobre una card. Es el flujo estándar de trabajo.

**Ejemplos:**
- `Comencemos con la VEC-3200`
- `Arrancamos con VEC-3200`

**Lo que ejecuta Claude:**

1. Lee la card en Jira — descripción, criterios de aceptación y comentarios
2. Lee el código relevante en `vec-fleet` para identificar contexto que la card no detalla (implementación, validaciones, flags de config, middlewares)
3. Propone un plan de trabajo: casos de prueba, endpoints, datos de prueba necesarios y orden de ejecución recomendado
4. Si el módulo tiene documentación en Confluence, al **cerrar la card** revisa la página y propone actualizaciones si algo cambió o quedó sin documentar

---

## Comparemos VEC-XXXX

**Cuándo usarlo:** Cuando llega una card de feature nuevo y se quiere saber si impacta o contradice la documentación existente de ese módulo, **antes de ejecutar QA**.

**Ejemplos:**
- `Comparemos VEC-3200`
- `Compará la VEC-3200`

**Lo que ejecuta Claude:**

1. Lee la card en Jira — descripción y comentarios
2. Identifica a qué módulo pertenece y lee su página en Confluence **únicamente dentro de la carpeta "Documentación Técnico/Funcional por Módulos"** (ancestor = 1566834691, espacio VFI)
3. Contrasta:
   - ¿La card introduce comportamiento nuevo no documentado?
   - ¿Contradice algo que la doc establece como correcto?
   - ¿Expone gaps o casos borde que la doc no cubre?
4. Reporta hallazgos — sin ejecutar QA ni tocar código

**Limitación — módulo sin documentación:**

Si el módulo al que pertenece la card no tiene página en Confluence, Claude responde:

> "La documentación de este módulo no está disponible aún. Los módulos documentados hasta el momento son: [lista]. Puedo ejecutar el análisis estándar (Comencemos) o comparar contra lo que tenga en memoria interna."

Esta herramienta es un trabajo en desarrollo. La ausencia de documentación para un módulo es esperada — el objetivo es ir cubriendo módulos progresivamente.

---

## Módulos documentados

| Módulo | Estado | Publicado en Confluence | Fecha |
|---|---|---|---|
| Períodos de Presupuesto | ✅ Publicado | [Ver página](https://vecfleet-kanban.atlassian.net/wiki/spaces/VFI/pages/1567784963) | 2026-05-21 |

> A medida que se publiquen nuevos módulos, agregar una fila a esta tabla.

---

## Mantenimiento

Este archivo es mantenido por el área de QA. Si realizás cambios, Claude detectará la modificación en la siguiente sesión e informará quién cambió el archivo y qué secciones fueron modificadas.

Cualquier cambio en el flujo de los comandos debe reflejarse tanto aquí como en la memoria interna de Claude para mantener coherencia.
