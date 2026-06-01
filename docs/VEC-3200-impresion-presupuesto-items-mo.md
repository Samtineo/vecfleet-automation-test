# Impresión de presupuesto — Diferenciación ITEMS vs MANO DE OBRA (VEC-3200)

## 1. ¿Qué hace esta feature?

Corrige la hoja impresa/exportación PDF del presupuesto para que respete la diferenciación entre ITEMS/repuestos y MANO DE OBRA según el config `tickets.trabajaConManoDeObra.habilitado`. Antes del fix, la API y el frontend ignoraban este config y siempre separaban los ítems por tipo.

---

## 2. Configs relevantes

| Config key | Valor | Efecto en print |
|---|---|---|
| `tickets.trabajaConManoDeObra.habilitado` | `true` | `repuestos` = ítems tipo Producto; `manoDeObraItems` = ítems tipo MO |
| `tickets.trabajaConManoDeObra.habilitado` | `false` | `repuestos` = todos los ítems (Producto + MO juntos); `manoDeObraItems` = `[]`; solo las tareas van a sección MO |

---

## 3. Endpoint

Base: `https://vec-dev.vecfleet.io/ws/Public/index.php/api`  
Auth header: `Authorization-Token: <token>`

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/tickets/print-data-pdf/{ticketId}` | Datos del presupuesto activo formateados para el PDF. Retorna `repuestos`, `manoDeObraItems`, `tareas`. |

**Response (config `true`):**
```json
{
  "repuestos": [{ "descripcion": "Repuesto Default", "tipo": "Producto", ... }],
  "manoDeObraItems": [{ "descripcion": "Mano de Obra Default", "tipo": "Mano De Obra", ... }],
  "tareas": []
}
```

**Response (config `false`):**
```json
{
  "repuestos": [
    { "descripcion": "Repuesto Default", "tipo": "Producto" },
    { "descripcion": "Mano de Obra Default", "tipo": "Mano De Obra" }
  ],
  "manoDeObraItems": [],
  "tareas": []
}
```

---

## 4. Fix aplicado

**API — `TicketsController.php` (endpoint `print-data-pdf`):**
```php
$trabajaConManoDeObra = ConfigBusiness::get('tickets.trabajaConManoDeObra.habilitado') === 'true';
if ($trabajaConManoDeObra) {
    $repuestos = (clone $baseItems)->where(fn($q) => $q->where('items.tipo', '!=', Item::MANO_DE_OBRA)->orWhereNull('items.tipo'))->get();
    $manoDeObraItems = (clone $baseItems)->where('items.tipo', '=', Item::MANO_DE_OBRA)->get();
} else {
    $repuestos = $baseItems->get();
    $manoDeObraItems = collect([]);
}
```

**Frontend — `TicketDatosGenerales.js` (función `handleImprimirTicket`):**
```js
const trabajaConManoDeObra = ConfigBusiness.get('tickets.trabajaConManoDeObra.habilitado') === 'true';
let manoDeObraItems = trabajaConManoDeObra ? (response.manoDeObraItems || []) : [];
```

---

## 5. Casos de prueba

| CA | Config | Descripción | Resultado esperado |
|---|---|---|---|
| CA1 | `true` | Vista operativa — ítems y MO en secciones correctas | Consistente con print |
| CA2–CA3 | `true` | Print tickets ABIERTO y PRESUPUESTADO | `repuestos` = Producto, `manoDeObraItems` = MO |
| CA4 | `true` | Print ticket CERRADO | Idem |
| CA5 | `true` | Total MO en print = suma de ítems MO | Sin discrepancias |
| CA6 | `false` | Print — todos los ítems en `repuestos`, `manoDeObraItems` vacío | Consistente con vista operativa |

---

## 6. Data de prueba — vec-dev

| Dato | Valor |
|---|---|
| Ticket de prueba | ID 576 (HWX6787, CERRADO) |
| Presupuesto | Repuesto Default (ID 31, tipo Producto) + Mano de Obra Default (ID 32, tipo MO) |
| Config en vec-dev | `false` (default del sistema) |

---

## 7. Gotchas

- **Campo `costo` vs `precio`:** el payload del presupuesto usa `costo`, pero el response de `print-data-pdf` devuelve el campo como `precio`. El repository mapea internamente.
- **`costo_fijo = 1`:** los ítems ID 31 y 32 tienen precio fijo — no se puede sobreescribir al cargar el presupuesto.
- Config `false` es el default. Para testear `true` hay que habilitarlo en DB.

---

## 8. Resultados QA

| CA | Resultado | Fecha |
|---|---|---|
| CA1–CA5 (`true`) | ✅ PASS | 2026-05-30 |
| CA6 (`false`) | ✅ PASS (regresión corregida por Ivan Velazquez) | 2026-06-01 |

**QA Report:** VEC-3256
