# Tickets Correctivos — Motivos extra configurables (VEC-3204)

## 1. ¿Qué hace esta feature?

Permite incorporar motivos adicionales configurables por instancia para tickets correctivos. Los motivos extra aparecen como checkboxes en el detalle del ticket, están disponibles en el selector de motivos al crear, se registran en el historial y se exportan como columnas en el Excel.

---

## 2. Configuración

Los motivos se definen en `config_business`. Cada entrada representa un motivo:

```sql
INSERT INTO `vec-dev`.config_business (seccion, grupo, subgrupo, parametro, valor) VALUES
('tickets', 'motivosExtra', 'auxilio', 'label', 'Auxilio'),
('tickets', 'motivosExtra', 'ruta', 'label', 'Ruta');
```

- `subgrupo` = key interno del motivo
- `valor` = texto visible para el usuario y en el Excel

**Sin config:** la funcionalidad no aparece en ningún lado del sistema.

---

## 3. Endpoint

Base: `https://vec-dev.vecfleet.io/ws/Public/index.php/api`  
Auth header: `Authorization-Token: <token>`

| Método | Endpoint | Descripción |
|---|---|---|
| PUT | `/tickets/motivo-extra/{ticketId}` | Activa o desactiva un motivo extra en el ticket |

**Body:**
```json
{ "nombre": "auxilio", "activo": true }
```

**Response:** HTTP 204 (sin body)

---

## 4. Casos de prueba

| CA | Descripción | Resultado esperado | Estado |
|---|---|---|---|
| CA1 | Sin config `motivosExtra` en DB | Funcionalidad no visible en alta ni detalle | ✅ PASS |
| CA2 | Con config → crear correctivo | "Auxilio" aparece en el selector de motivos | ✅ PASS (UI) |
| CA3 | `PUT /tickets/motivo-extra/{id}` con `activo=true` | HTTP 204, `motivos_extra: {"auxilio": true}` en el ticket | ✅ PASS |
| CA4 | Abrir detalle del ticket | Checkbox "Auxilio" visible y marcado | ✅ PASS (UI) |
| CA5 | Ver historial del ticket | Cambio de motivo registrado | ✅ PASS (UI) |
| CA6 | `PUT /tickets/motivo-extra/{id}` con `activo=false` | HTTP 204, valor actualizado a false | ✅ PASS |
| CA7 | Exportar Excel | Columna "Auxilio" presente (deshabilitada por defecto en selector de columnas) | ✅ PASS (UI) |
| CA8 | Crear ticket sin motivosExtra | HTTP 201, motivos base (Desgaste, Garantía, etc.) no afectados | ✅ PASS |

---

## 5. Data de prueba — vec-dev

| Dato | Valor |
|---|---|
| Ticket con auxilio=true | ID 612 |
| Ticket sin motivosExtra | ID 617 |

---

## 6. Observación de scope

La card mencionaba "visualización en grilla y filtros". La implementación entregada cubre: detalle, creación, Excel e historial. **No incluye** columna dedicada en grilla web ni filtro por `motivosExtra`. Se interpreta que el alcance se satisface a través del selector en creación y la visualización en detalle. Columna/filtro en grilla queda como posible incremento futuro.

---

## 7. Resultados QA

Todos los CAs: ✅ PASS (2026-06-02)  
**QA Report:** VEC-3262
