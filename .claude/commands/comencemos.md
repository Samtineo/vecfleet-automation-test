Arrancamos QA para la card $ARGUMENTS.

1. Leé la card en Jira (vecfleet-kanban.atlassian.net) — descripción, criterios de aceptación y **todos los comentarios**.
2. Buscá el código relevante en vec-fleet (API y web) para identificar: implementación, validaciones, flags de config, middlewares involucrados, y cualquier detalle técnico que la card no detalle explícitamente.
3. Proponé un plan de trabajo con:
   - Casos de prueba (happy path + bordes + permisos si aplica)
   - Endpoints a usar y métodos HTTP
   - Datos de prueba necesarios (qué crear antes de arrancar)
   - Orden de ejecución recomendado
   - Configuraciones a verificar en vec-dev

El entorno de prueba por defecto es vec-dev.vecfleet.io. No ejecutes ningún caso hasta que el plan esté acordado.

---

> **Alternativas equivalentes (texto natural):**
> - `Comencemos con VEC-XXXX`
> - `Arrancamos con VEC-XXXX`
> - `Seguimos con VEC-XXXX`
