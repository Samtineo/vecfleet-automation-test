Analizá la card $ARGUMENTS contra la documentación existente del módulo, sin ejecutar QA.

1. Leé la card en Jira (vecfleet-kanban.atlassian.net) — descripción y comentarios.
2. Identificá a qué módulo pertenece y leé su página en Confluence (espacio VFI, carpeta "Documentación Técnico/Funcional por Módulos").
3. Contrastá:
   - ¿La card introduce comportamiento nuevo no documentado?
   - ¿Contradice algo que la doc establece como correcto?
   - ¿Expone gaps o casos borde que la doc no cubre?
4. Reportá los hallazgos. No ejecutes QA ni toques código.

Si el módulo no tiene página en Confluence, respondé:
> "La documentación de este módulo no está disponible aún. Los módulos documentados son: [lista]. Puedo ejecutar el análisis estándar (`/comencemos`) o comparar contra lo que tenga en memoria interna."

---

> **Alternativas equivalentes (texto natural):**
> - `Comparemos VEC-XXXX`
> - `Compará la VEC-XXXX`
