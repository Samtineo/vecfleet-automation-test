# Períodos de Presupuesto — Documentación funcional y QA

## 1. ¿Qué es el módulo de Períodos de Presupuesto?

Permite definir ventanas temporales (períodos) dentro de los cuales se asignan montos presupuestarios a distintas entidades de la jerarquía: **Región → Subregión → Base**. Los tickets aprobados dentro de ese período descuentan del presupuesto asignado, permitiendo hacer seguimiento de gasto comprometido y consumido vs. presupuestado.

### Campos clave del resumen (`presupuesto-resumen`)

| Campo | Descripción |
|---|---|
| `distribuido` | Monto asignado a niveles inferiores de la jerarquía |
| `comprometido` | Tickets en estado APROBADO (no cerrados) con fecha dentro del período |
| `consumido` | Tickets en estado APROBADO y CERRADO con fecha dentro del período |

> La query usa `COALESCE(fechaRealEntrega, fecha_aprobacion)` para determinar si un ticket cae dentro del período. Fix incluido en VEC-3040.

---

## 2. Requisitos para que la funcionalidad opere correctamente

Todos los requisitos deben estar cumplidos. Si alguno falta, los tickets aprobados no impactarán en `comprometido` ni en `consumido`.

### 2.1 Config-business: `trabajaConEstadosPresupuesto.habilitado = true` ⚠️

**Este es el requisito más crítico y el más fácil de pasar por alto.** La lógica de descuento presupuestario está protegida por este flag en `TicketsService::aprobar()`:

```php
if ($config->get('tickets.trabajaConEstadosPresupuesto.habilitado') == 'true') {
    $this->changeBudgetState('Pendiente', 'Aprobado');  // llama a sumarizarTotalesAprobados()
}
```

Si está deshabilitado, la aprobación del ticket funciona normalmente (HTTP 204, estado=APROBADO), pero **`comprometido` no se actualiza**. No hay error visible — es el síntoma más confuso.

### 2.2 Período activo que cubra la fecha de aprobación

Debe existir un período cuyo rango cubra la `fecha_aprobacion` del ticket (o `fechaRealEntrega` si está seteada). Si el ticket se aprueba fuera del rango, no aparece en el resumen.

### 2.3 Presupuesto asignado en la jerarquía

La base, subregión y región deben tener presupuesto generado para el período (`monto_general > 0`).

### 2.4 Permisos de usuario

El perfil debe tener los permisos del grupo `PRESUPUESTO_`:
```
PRESUPUESTO_ACCESO, PRESUPUESTO_CONSULTAR, PRESUPUESTO_EDITAR
PRESUPUESTO_PERIODO_ACCESO, PRESUPUESTO_PERIODO_CONSULTAR, PRESUPUESTO_PERIODO_EDITAR
```

---

## 3. Cómo crear un período desde la API

### Crear la config de período

```http
POST /periodo-configs
{ "nombre": "Nombre", "frecuencia": "mensual", "duracion": 1, "fecha_inicio": "2026-05-04" }
```

Genera automáticamente presupuestos para todas las entidades con `monto_general = 0`.

Para eliminar: `DELETE /periodo-configs/{id}`

### Obtener IDs de presupuesto generados

```http
GET /presupuestos?periodoId={PERIODO_ID}&limit=300
```

Filtrar por `presupuestable_type` y `presupuestable_id` para encontrar los IDs de región, subregión y base.

### Asignar montos

```http
PATCH /presupuestos/{id}
{ "monto_general": 1000000 }
```

> `monto_general` es mutuamente excluyente con `monto_preventivo`, `monto_correctivo`, `monto_gestoria` y `monto_vencimientos`.

### Verificar resumen

```http
GET /presupuestos/presupuesto-resumen/{ENTITY_ID}?periodoId={PERIODO_ID}&presupuestableType=base|subregion|region
```

---

## 4. Flujo de un ticket en el presupuesto

```
ABIERTO
  → POST /ticket-presupuestos/ticket/{id}   { manoDeObra, repuestos, impuestos, otros, adicional }
PRESUPUESTADO
  → POST /tickets/aprobar/{id}
APROBADO  ←  aparece en comprometido  (requiere req. 2.1)
  → POST /tickets/cerrar/{id}
CERRADO   ←  pasa de comprometido a consumido
```

---

## 5. Configuración de entornos

### Heineken-Test (entorno activo de QA para VEC-3040)

| Campo | Valor |
|---|---|
| Host | `test-heineken.vecfleet.io` |
| Período activo | ID 71 — "VEC-3040 Test — Mayo 2026" (2026-05-04 / 2026-06-03) |
| Config período | ID 8 |
| Región | CENTRO (ID 1004) |
| Subregión | PUEBLA (ID 1019) |
| Base | CD - TEHUACAN (ID 1101) |
| Presupuesto región | ID 17435 |
| Presupuesto subregión | ID 17462 |
| Presupuesto base | ID 17579 |

### vec-dev

| Campo | Valor |
|---|---|
| Host | `vec-dev.vecfleet.io` |
| Período activo | ID 146 (2026-03-30 / 2026-07-29) |
| Región / Subregión / Base | ID 1 / 1 / 1 |

---

## 6. Scripts

| Script | Entorno | Descripción |
|---|---|---|
| `scripts/hnk-test-tc-3040.js` | Heineken-Test | TCs VEC-3040 — flujo ABIERTO→PRESUPUESTADO→APROBADO, verifica comprometido |
| `scripts/vec-dev-tc-3040.js` | vec-dev | Mismo flujo en vec-dev |

```bash
node scripts/hnk-test-tc-3040.js
node scripts/vec-dev-tc-3040.js
```

---

## 7. Casos de prueba — VEC-3040

**Bug:** Sin el fix, tickets aprobados con `fechaRealEntrega=NULL` quedan excluidos del resumen de `comprometido`.  
**Fix:** `COALESCE(fechaRealEntrega, fecha_aprobacion)` en `TicketsPresupuestosRepository.php`.

| TC | Descripción | Verificación |
|---|---|---|
| TC-01 | Flujo ABIERTO→PRESUPUESTADO→APROBADO sin `fechaRealEntrega` aparece en `comprometido` | `comprometido` de base aumenta en el total del ticket |
| TC-02 | Resumen de subregión refleja el comprometido | `comprometido > 0` en subregión |
| TC-03 | Resumen de base refleja el comprometido | `comprometido > 0` en base |
| TC-04 | Guardar monto de subregión no sobreescribe campo región | `region.id` de subregión no cambia tras PATCH de presupuesto |

---

## 8. Historial de bloqueos resueltos

| Bloqueo | Síntoma | Resolución |
|---|---|---|
| `sumarizarTotalesAprobados` SQL bug | `POST /tickets/aprobar` → HTTP 500 | Agregar paréntesis: `WHERE ticket=:id AND (estado='Aprobado' OR estado='Pendiente')` + null guard en `fetch()` |
| Mecánica Tek (MTEK) sin conectividad | `POST /tickets/aprobar` → HTTP 400 | Deshabilitar `mtek.habilitado` en config-business del entorno |
| `trabajaConEstadosPresupuesto.habilitado = false` | HTTP 204 exitoso pero `comprometido` permanece en 0 | Habilitar el flag en config-business del entorno |

---

## 9. Historial de ejecuciones

<!-- AUTOGENERADO por scripts/hnk-test-tc-3040.js y scripts/vec-dev-tc-3040.js -->
<!-- Formato: | Fecha | Entorno | Período | Ticket | TC-01 | TC-02 | TC-03 | TC-04 | -->

| Fecha | Entorno | Período | Ticket | TC-01 | TC-02 | TC-03 | TC-04 |
|---|---|---|---|---|---|---|---|
| 2026-05-04 | Heineken-Test | 70 (05-01/05-31) | 12551 | FAIL (COALESCE no deployado) | FAIL | FAIL | PASS |
| 2026-05-04 | Heineken-Test | 71 (05-04/06-03) | 12552 | FAIL (trabajaConEstadosPresupuesto deshabilitado) | FAIL | FAIL | PASS |
| 2026-05-04 | Heineken-Test | 71 (05-04/06-03) | 12552 | FAIL | PASS | PASS | PASS |
| 2026-05-04 | Heineken-Test | 71 (05-04/06-03) | 12271 | FAIL | PASS | FAIL | PASS |
| 2026-05-04 | Heineken-Test | 71 (05-04/06-03) | 12479 | FAIL | PASS | PASS | PASS |
| 2026-05-04 | Heineken-Test | 71 (05-04/06-03) | 13074 | PASS | PASS | PASS | PASS |

---

## 10. Pendientes

- [ ] Re-ejecutar con `trabajaConEstadosPresupuesto.habilitado = true` activo → confirmar PASS en TC-01/02/03
- [ ] Crear reporte QA VEC-3040 en Jira (subtarea de la card madre)
