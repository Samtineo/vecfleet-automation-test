---
name: qa-exec-vec-3122
description: "Ejecución QA de VEC-3122: Ítems (MO y Repuestos) desde Checklist para tickets correctivos — prerrequisitos, happy path, casos de borde, gotchas"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3ba4e115-0704-4be3-b075-1acfc8cfa7db
---

## Feature

Asociación de Ítems (Mano de Obra y Repuestos) desde Checklist para generación de tickets correctivos.

**Card:** VEC-3122  
**QA Report:** [VEC-3183](https://vecfleet-kanban.atlassian.net/browse/VEC-3183) — Finalizada  
**Estado:** ✅ 13/13 API + 4/4 UI — PASS completo

## Gate de activación (AND lógico)

```
tickets.presupuesto.tipo === 'detallado'
AND (tickets.trabajaConManoDeObra.habilitado === 'true'
     OR tickets.trabajaConRepuestos.habilitado === 'true')
```

Si el gate no se activa → el formulario genera tickets via **tareas** (comportamiento legacy).

## Tabla de comportamiento

| Escenario | presupuesto.tipo | trabajaMO | trabajaRep | Resultado |
|---|---|---|---|---|
| 1 | simple | cualquiera | cualquiera | Tareas (gate inactivo) |
| 2 | detallado | false | false | Tareas (gate inactivo) |
| 3 | detallado | true | false | Items solo MO |
| 4 | detallado | false | true | Items solo Rep |
| 5 | detallado | true | true | Items MO + Rep |

## Prerrequisitos

1. **Configs activas** en `config_business`:
   ```
   tickets.presupuesto.tipo = detallado
   tickets.trabajaConManoDeObra.habilitado = true   (o trabajaConRepuestos)
   panol.items.clasificacion.habilitado = true
   ```

2. **TipoFormulario** con `atributoDinamico` configurado:
   - `genera_ticket = 1`
   - `estado = 2` (INVALIDO como trigger)
   - `extraParams.items_mano_de_obra = [id_item_1, ...]`
   - `extraParams.items_repuestos = [id_item_1, ...]`

3. **Ítems disponibles**: buscar con `GET /items/simple-search?texto=`

## Happy path (API)

```
# 1. Verificar configs
GET /configuracion
→ presupuesto.tipo = "detallado", trabajaConManoDeObra.habilitado = "true"

# 2. Verificar TF con items configurados
GET /tipoformularios/{tf_id}
→ atributos_dinamicos[0].extra_params.items_mano_de_obra != []
→ atributos_dinamicos[0].extra_params.items_repuestos != []

# 3. Buscar ítems disponibles
GET /items/simple-search?texto=frenos
→ array de items con id, descripcion, tipo

# 4. Crear formulario con valor INVALIDO → genera ticket
POST /formulario
{
  "tipo_formulario_id": {tf_id},
  "movil_id": {movil_id},
  "latitudForm": -34.6037,
  "longitudForm": -58.3816,
  "activo": 1,
  "valores_dinamicos": [{
    "atributo_dinamico_id": {ad_id},
    "estado": 2,
    "value": "DESAPROBADO"
  }]
}
→ 201

# 5. Verificar ticket generado con items
GET /tickets/{ticket_id}
→ items != [] (si modo items activo)
→ items[0].tipo, items[0].cantidad
```

## Datos de vec-dev usados durante QA

| Entidad | ID | Descripción |
|---|---|---|
| TF con tareas (legacy) | 41 | TF basado en tareas, genera ticket SIN items |
| Ticket generado (tareas) | 593 | Ticket con TF 41 — no tiene items ✅ esperado |
| TF con items configurados | - | Creado durante QA con extraParams |
| Ticket generado (items) | 594 | Ticket con items de MO y/o Rep ✅ visible en presupuesto |

## Casos de borde validados

- CA5: TF con `tareas` (no `extraParams.items_*`) genera ticket SIN items → PASS
- CA7: Configurar solo MO, solo Rep, o ambos → gate respeta cada flag independientemente
- CA8: Config `simple` → no items aunque haya items en extraParams → PASS
- Validación 4 UI: Ticket 593 (TF tareas) no muestra items en UI → PASS (comportamiento esperado)

## Gotchas críticos

**1. `trabajaConManoDeObra` es runtime, no se guarda por ticket**

El config se lee en `POST /formulario`. Cambiar el config DESPUÉS de crear un ticket NO afecta tickets ya generados. El frontend tampoco lee este config — los items aparecen según lo que se guardó en `ticket_items` al momento de creación.

```
# FormularioController.php líneas 251-253
$esItemsMode = $configMO || $configRep;  // leído al momento del POST
```

**2. Los items vienen de `servicio_item`, no de `extraParams` directamente**

`extraParams.items_mano_de_obra` almacena IDs de items como filtro. Al generar el ticket, el backend itera `servicio_item` usando esos IDs para determinar cantidades. Si un item está en `extraParams` pero no en `servicio_item` del servicio del AD, no se copia al ticket.

**3. `ticket_items` es inmutable post-creación**

Una vez creado el ticket, los items no pueden modificarse por API. Si se necesita re-testear, crear un ticket nuevo con un movil/formulario nuevo.

**4. Mismo gate que [[qa-technique-gate-and-logico]]**

El AND gate de items es el mismo patrón que otros módulos que requieren múltiples configs activas. Nunca asumir que una sola config es suficiente.
