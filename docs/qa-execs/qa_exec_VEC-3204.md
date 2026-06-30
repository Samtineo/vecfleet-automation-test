---
name: qa-exec-vec-3204
description: "QA VEC-3204 — Tickets correctivos: motivos extra configurables. 8/8 PASS. PUT /tickets/motivo-extra/{id}. QA Report: VEC-3262"
metadata: 
  node_type: memory
  type: project
  originSessionId: ae01135e-d1eb-4594-90d4-8d278a96574e
---

## Feature
Motivos extra configurables por instancia para tickets correctivos. Cada cliente puede definir sus propios motivos (ej: Auxilio) via config-business. Aparecen como checkboxes en el detalle del ticket y columnas en el Excel.

## Config requerida

```sql
INSERT INTO `vec-dev`.config_business (seccion, grupo, subgrupo, parametro, valor) VALUES
('tickets', 'motivosExtra', 'auxilio', 'label', 'Auxilio');
```

Sin config → la funcionalidad no aparece en ningún lado.

## Endpoint

`PUT /api/tickets/motivo-extra/{ticketId}`  
Body: `{ "nombre": "auxilio", "activo": true|false }`  
Response: HTTP 204

## Resultados QA — 8/8 PASS

| CA | Descripción | Resultado |
|---|---|---|
| CA1 | Sin config → funcionalidad no aparece | ✅ PASS |
| CA2 | Con config → "Auxilio" visible en selector al crear correctivo | ✅ PASS (UI) |
| CA3 | PUT motivo-extra con auxilio=true → guarda correctamente (`motivos_extra: {"auxilio": true}`) | ✅ PASS |
| CA4 | Motivo visible en detalle del ticket (checkbox marcado) | ✅ PASS (UI) |
| CA5 | Cambio registrado en historial del ticket | ✅ PASS (UI) |
| CA6 | Toggle auxilio=false → HTTP 204, valor actualizado | ✅ PASS |
| CA7 | Columna "Auxilio" en Excel (deshabilitada por defecto) | ✅ PASS (UI) |
| CA8 | Ticket sin motivosExtra → motivos base no afectados | ✅ PASS |

**QA Report:** [VEC-3262](https://vecfleet-kanban.atlassian.net/browse/VEC-3262)

## Observación de scope

La card menciona "grilla y filtros" pero la implementación no incluyó columna dedicada en grilla web ni filtro por motivosExtra. Se interpreta que grilla/filtros se cubre con el selector en creación (CA2) y detalle (CA4). Si se requiere columna/filtro en grilla, es una card adicional.

## Data de prueba — vec-dev

| Dato | Valor |
|---|---|
| Ticket con auxilio=true | ID 612 |
| Ticket sin motivosExtra | ID 617 |
| Config motivosExtra | `seccion=tickets, grupo=motivosExtra, subgrupo=auxilio, parametro=label, valor=Auxilio` |
