---
name: qa-exec-vec-3231
description: QA Exec para VEC-3231 — Separar permisos de carga de presupuesto inicial y adicional por tipo de ítem (MO y repuestos). Entorno vec-dev.
metadata: 
  node_type: memory
  type: project
  originSessionId: 8bf28f2b-3feb-46fc-aa8b-2f46ff497a9a
---

## Entorno
- URL base: vec-dev
- Config requerida:
  - `tickets.presupuesto.borrador.habilitado = true`
  - `tickets.presupuesto.tipo = detallado`
  - `tickets.trabajaConManoDeObra = true`

## Prerrequisitos

### Config en config_business
Verificar que las tres configs estén activas antes de ejecutar cualquier CA.

### Perfiles QA creados en vec-dev
| Perfil ID | Nombre / Uso |
|---|---|
| 738 | Solo `TICKETS_PRESUPUESTO_CARGA_MO_INICIAL` |
| 739 | Solo `TICKETS_PRESUPUESTO_CARGA_REPUESTO_ADICIONAL` |
| 740 | Sin ninguno de los 4 permisos nuevos |

### Usuario de prueba
- `qa.valida1` — atención: el sistema renombró el username a `qa.valida1.1777496525018` al reactivar la cuenta. Verificar username real antes de autenticar.

### Items con costo fijo (obligatorio respetar el costo del catálogo en el payload)
| Item ID | Descripción | Costo fijo |
|---|---|---|
| 32 | MO Default | 1000 |
| 36 | Excelso | 1500 |

### Tickets de referencia usados en la ejecución
| Ticket | Uso |
|---|---|
| 759 | CA01 — sin permisos |
| 761 | CA02, CA03, CA05 — solo MO Inicial |
| 762 | CA04 — solo Repuesto Adicional con aprobado previo |
| 763 | S06 — Preventivo |
| 764 | S06 — Vencimiento |

### Confirmar adicional=true
Antes de ejecutar CA04, verificar en `GET /ticket-presupuestos/ticket/{ticketId}/items-activos` que el campo `adicional` sea `true` (debe existir un presupuesto Aprobado previo para el ticket 762).

## Endpoints usados

| Método | Endpoint | Para qué |
|---|---|---|
| POST | `/public/auth/login` | Obtener token de autenticación |
| POST | `/ticket-presupuestos/ticket/{ticketId}/borrador` | Guardar presupuesto en estado Borrador (nuevo) |
| POST | `/ticket-presupuestos/ticket/{ticketId}` | Promover borrador o crear presupuesto definitivo |
| GET | `/ticket-presupuestos/ticket/{ticketId}/items-activos` | Ver items del presupuesto activo + campo `adicional` |
| GET | `/ticket-presupuestos/ticket/{ticketId}/grid` | Histórico de presupuestos del ticket |
| PUT | `/perfiles/{id}` | Asignar/quitar permisos a un perfil |
| PATCH | `/personas/{id}` | Cambiar perfil de usuario (ver gotcha) |

## Casos de prueba

| CA | Escenario | Resultado | Observacion |
|---|---|---|---|
| CA01 | POST /borrador sin ninguno de los 4 permisos nuevos | PASS | Retorna 403 con lista de permisos requeridos. Ticket 759 |
| CA02 | Solo CARGA_MO_INICIAL: enviar MO + repuesto. MO persiste, repuesto descartado silenciosamente. Ticket no transiciona | PASS | Borrador 495 creado. El descarte es silencioso: no hay 403 ni mensaje de error por el repuesto |
| CA03 | Segundo POST /borrador para el mismo ticket reutiliza el mismo borrador, no crea uno nuevo | PASS | Ticket 761, Borrador 495 reutilizado. Verificar con GET /grid que no se duplicaron |
| CA04 | Solo CARGA_REPUESTO_ADICIONAL con aprobado previo: repuesto persiste, MO descartado. Campo adicional=true | PASS | Ticket 762, Borrador 498. Confirmar adicional=true antes de ejecutar |
| CA05 | Promover borrador via POST /ticket/{id} con idPresupuesto=borradorId → ticket transiciona a PRESUPUESTADO | PASS | Ticket 761, Borrador 495 promovido a Presupuesto 499 |
| CA06 | Config gate: borrador.habilitado=true activo | PASS | Confirmado vía setup del entorno y comportamiento en CA01 |
| CA07 | UI: los 4 permisos nuevos son visibles en Admin > Seguridad, asignables y revocables de forma independiente | PASS | Confirmado visualmente por el usuario |
| CA08 | Los 4 permisos nuevos estan deshabilitados en todos los perfiles existentes (no hay escalada accidental) | PASS | Confirmado en sesion anterior al deploy |
| S06 | Los permisos se respetan en tickets de tipo Correctivo, Preventivo y Vencimiento | PASS | Tickets 763 (Preventivo) y 764 (Vencimiento) |

## Gotchas

- **costo_fijo obligatorio:** Los items 32 (MO Default, costo=1000) y 36 (Excelso, costo=1500) tienen costo fijo. El payload debe enviar exactamente el valor del catálogo. Si se envía un costo distinto, el endpoint lo rechaza o lo sobreescribe — no queda en el presupuesto el valor esperado.

- **Username renombrado:** El usuario `qa.valida1` fue renombrado automáticamente a `qa.valida1.1777496525018` al activar la cuenta. Verificar el username real con GET /personas antes de autenticar.

- **trabajaConManoDeObra = true cambia el modelo de datos:** Con esta config activa, los items de MO van en el array `presupuestoItems` del payload, NO en `presupuestoTareas`. Esto es diferente del flujo Simple donde MO va como campo numérico.

- **Enforcement silencioso:** Si el usuario tiene permiso para MO pero no para repuestos, y envía ambos en el payload, el endpoint guarda los MO y descarta los repuestos sin devolver ningún error ni advertencia. El 403 solo se emite cuando el usuario no tiene ninguno de los 4 permisos.

- **PATCH /personas/{id} no cambia el perfil:** Usar `PATCH /personas/{id}` con el campo `usuario.perfil` retorna 204 pero no aplica el cambio de perfil en la base. El workaround correcto es modificar el perfil directamente via `PUT /perfiles/{id}` agregando o quitando el permiso del perfil correspondiente.

- **Inicial vs Adicional:** El sistema determina si el presupuesto es Inicial o Adicional según si existe un presupuesto Aprobado previo para ese ticket (campo `existeAprobado`). El campo `adicional` en la respuesta de `/items-activos` expone este dato. Si no hay aprobado previo, siempre es Inicial aunque el operador quiera cargar un adicional.

- **Promover el borrador:** El borrador (activo=0) no transiciona el ticket. Para transicionar, se debe llamar a `POST /ticket-presupuestos/ticket/{id}` (el endpoint normal) pasando `idPresupuesto=<borradorId>`. Eso promueve el borrador y ejecuta la transicion de estado.

## QA Report
VEC-3364 — https://vecfleet-kanban.atlassian.net/browse/VEC-3364
