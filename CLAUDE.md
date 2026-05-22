# CLAUDE.md — vecfleet-automation-test

Este repo es el espacio de trabajo del área de QA de VecFleet.
Contiene documentación de pruebas, resultados, mockups y comandos de trabajo asistido por Claude Code.

## Entorno

- **API de pruebas:** `https://vec-dev.vecfleet.io/ws/Public/index.php/api`
- **Gestión de tareas:** Jira — `vecfleet-kanban.atlassian.net`
- **Código fuente:** repo `vec-fleet` (solo lectura — nunca modificar)
- **Documentación técnica:** Confluence, espacio VFI, carpeta "Documentación Técnico/Funcional por Módulos" (ancestor = 1566834691)

## Flujos de trabajo

Cuando alguien diga alguna de las siguientes frases, ejecutar el flujo correspondiente **sin pedir más contexto**:

### Arrancar QA de una card
Frases: `comencemos con VEC-XXXX`, `arrancamos con VEC-XXXX`, `vamos con VEC-XXXX`, `seguimos con VEC-XXXX`, `/comencemos VEC-XXXX`

**Flujo:** leer la card en Jira (descripción + criterios + comentarios) → leer el código relevante en vec-fleet → proponer plan de trabajo con casos de prueba, endpoints, datos necesarios y orden de ejecución. No ejecutar ningún caso hasta que el plan esté acordado.

### Comparar una card contra documentación
Frases: `comparemos VEC-XXXX`, `compará la VEC-XXXX`, `/comparemos VEC-XXXX`

**Flujo:** leer la card en Jira → buscar la página del módulo en la carpeta de Confluence indicada arriba (solo ahí, no en el resto del espacio VFI) → contrastar si introduce comportamiento nuevo, contradice la doc existente o expone gaps. No ejecutar QA ni tocar código.

## Docs de referencia

- Comandos detallados: `docs/methodology/quick-commands.md`
- Slash commands: `.claude/commands/`
