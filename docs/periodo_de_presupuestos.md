# Períodos de Presupuesto — Documentación funcional y QA

## 1. ¿Qué es el módulo de Períodos de Presupuesto?

Permite definir ventanas temporales (períodos) dentro de los cuales se asignan montos presupuestarios a distintas entidades de la jerarquía: **Región → Subregión → Base**. Luego, los tickets aprobados dentro de ese período descuentan del presupuesto asignado, permitiendo hacer seguimiento de gasto real vs. presupuestado.

### Campos clave del resumen (`presupuesto-resumen`)

| Campo | Descripción |
|---|---|
| `distribuido` | Monto asignado a niveles inferiores de la jerarquía |
| `comprometido` | Tickets aprobados, aún no cerrados, con fecha dentro del período |
| `consumido` | Tickets aprobados y cerrados con fecha dentro del período |

---

## 2. Cómo habilitar la función

### 2.1 Permisos requeridos

El usuario (o perfil de usuario) debe tener asignados los permisos del grupo `PRESUPUESTO_`. Desde el módulo de **Administración → Perfiles** se asignan los permisos:

```
PRESUPUESTO_ACCESO
PRESUPUESTO_CONSULTAR
PRESUPUESTO_EDITAR
PRESUPUESTO_PERIODO_ACCESO
PRESUPUESTO_PERIODO_CONSULTAR
PRESUPUESTO_PERIODO_EDITAR
```

### 2.2 Crear una configuración de período

Desde **Administración → Configuración de Períodos de Presupuesto**:
- Seleccionar tipo (mensual, anual, etc.)
- La configuración actúa como plantilla para los períodos concretos

### 2.3 Crear un período concreto

Desde **Administración → Períodos de Presupuesto**:
- Ingresar nombre, fecha de inicio y fecha de fin
- El período queda disponible para asignar presupuestos

---

## 3. Flujo paso a paso para asignar presupuesto

El presupuesto fluye de arriba hacia abajo en la jerarquía: Región → Subregión → Base.

### Paso 1: Obtener token de autenticación

```http
POST /public/auth/login
Content-Type: application/json

{ "usuario": "stineo", "clave": "susy1234" }
```

Respuesta: `usuario.token` → usar como header `Authorization-Token`.

### Paso 2: Listar regiones

```http
GET /regiones/select
```

### Paso 3: Obtener presupuesto de región

```http
GET /presupuestos?perPage=300
```

Buscar el registro con `presupuestable_id = {REGION_ID}` y `presupuestable_type` que incluya `Region`.

```http
PATCH /presupuestos/{presupuesto_id}
{ "monto_general": 500000 }
```

> **Nota:** `monto_general` es mutuamente excluyente con `monto_preventivo`, `monto_correctivo`, `monto_gestoria` y `monto_vencimientos`. Usar solo uno.

### Paso 4: Listar subregiones de una región

```http
GET /subregiones/{REGION_ID}/select
```

Obtener `presupuestable_id` de la subregión y hacer PATCH sobre el presupuesto correspondiente.

### Paso 5: Listar bases de una subregión

```http
GET /bases?subregion_id={SUBREGION_ID}&perPage=100
```

O buscar en la grilla de móviles para identificar la base:

```http
GET /moviles/newGrid?base={BASE_ID}
```

### Paso 6: Asignar presupuesto a la base

```http
PATCH /presupuestos/{presupuesto_base_id}
{ "monto_general": 60 }
```

### Paso 7: Verificar resumen

```http
GET /presupuestos/presupuesto-resumen/{ENTITY_ID}?periodoId={PERIODO_ID}&presupuestableType=base|subregion|region
```

> **Importante:** `ENTITY_ID` es el ID de la entidad (base, subregión o región), **no** el ID del presupuesto.

---

## 4. Configuración del entorno HNK MX (referencia)

| Campo | Valor |
|---|---|
| Host | `vec-twins-hnk-mx.vecfleet.io` |
| Base path | `/ws/Public/index.php/api` |
| SSL | Requiere `NODE_TLS_REJECT_UNAUTHORIZED=0` (certificado no verificado) |
| Usuario | `stineo` |
| Período de prueba | ID 1 — "Periodo Abril-Mayo 2026" (2026-04-01 / 2026-04-30) |
| Región | CENTRO (ID 1004) |
| Subregión | EDO DE MEXICO (ID 1029) |
| Base | CD - TOLUCA (ID 1138) |
| Móvil de prueba | ID 1348, dominio 4280, unidad LC18076 |

---

## 5. Scripts de automatización

| Script | Descripción |
|---|---|
| `scripts/hnk-setup.js` | Asigna montos de presupuesto a región/subregión/base |
| `scripts/hnk-create-ticket.js` | Crea ticket CORRECTIVO en el móvil de prueba |
| `scripts/hnk-tc-3040.js` | Ejecuta los 5 TCs de VEC-3040 |

---

## 6. Casos de prueba — VEC-3040

**Descripción del issue:** El resumen de presupuesto no incluía tickets aprobados que no tenían `fechaRealEntrega` (i.e., tickets en tránsito). El fix aplica `COALESCE(fechaRealEntrega, fecha_aprobacion)` para el filtro de fecha en la query de `comprometido`.

**Estado de ejecución:** 2026-04-29 — HNK MX Test

### TC-01: Ticket APROBADO sin fechaRealEntrega aparece en resumen

- **Precondición:** Ticket 933717 en estado PRESUPUESTADO, manoDeObra=40, `fechaRealEntrega=NULL`
- **Acción:** `POST /tickets/aprobar/933717`
- **Verificación:** `fechaAprobacion` seteada, `consumido > 0` en resumen de base
- **Resultado:** **BLOQUEADO** — `POST /tickets/aprobar/{id}` retorna HTTP 500 (ver bug VEC-XXXX)

### TC-02: Ticket con fechaRealEntrega dentro del período aparece en resumen

- **Precondición:** Ticket 933718 en estado PRESUPUESTADO, manoDeObra=20
- **Acción:** Aprobar ticket + setear `fechaRealEntrega=2026-04-15` via PATCH
- **Verificación:** `consumido >= 20` en resumen de base
- **Resultado:** **BLOQUEADO** — misma causa raíz que TC-01 (HTTP 500 en aprobar)
- **Nota adicional:** `PATCH /tickets/{id}` no acepta `fechaRealEntrega` ni `estado` — solo modifica campos logísticos (gerenciador, taller, fechaHoraTurno, fechaPrometida, enTaller, etc.)

### TC-03: Resumen de subregión incluye consumo de tickets del móvil

- **Acción:** `GET /presupuestos/presupuesto-resumen/1029?periodoId=1&presupuestableType=subregion`
- **Verificación:** `consumido > 0`
- **Resultado:** **BLOQUEADO** — depende de que TC-01/02 puedan aprobar tickets

### TC-04: Resumen de base incluye consumo de tickets del mismo móvil

- **Acción:** `GET /presupuestos/presupuesto-resumen/1138?periodoId=1&presupuestableType=base`
- **Verificación:** `consumido > 0`
- **Resultado:** **BLOQUEADO** — misma dependencia

### TC-05: Guardar monto de subregión no sobreescribe campo región

- **Precondición:** Subregión EDO DE MEXICO tiene `region.id=1004` (CENTRO)
- **Acción:** `PATCH /presupuestos/38` con `{ monto_general: 58 }` → luego `GET /subregiones/1029`
- **Verificación:** `region.id` sigue siendo 1004
- **Resultado:** **PASS** ✅ — El fix en `SubregionesAbm.js` funciona correctamente

---

## 7. Bug bloqueante — sumarizarTotalesAprobados

**Archivo:** `vec-fleet-api/Repository/TicketsPresupuestosRepository.php`  
**Método:** `sumarizarTotalesAprobados()`  
**Síntoma:** `POST /tickets/aprobar/{id}` retorna HTTP 500

### Bug 1 — Precedencia de operadores SQL

```sql
-- ❌ Incorrecto (evalúa como: ticket=X AND estado='Aprobado' OR estado='Pendiente')
WHERE ticket = :ticketId AND estado = 'Aprobado' OR estado = 'Pendiente'

-- ✅ Correcto
WHERE ticket = :ticketId AND (estado = 'Aprobado' OR estado = 'Pendiente')
```

### Bug 2 — Null pointer en fetch

```php
$ultimoPresupuesto = $stmt->fetch(PDO::FETCH_OBJ);
// Si Bug 1 hace que el WHERE devuelva 0 registros, fetch() retorna false/null
$ticket->setPresupuestoNombre($ultimoPresupuesto->nombre);     // ❌ Fatal error
$ticket->setPresupuestoFechaHora($ultimoPresupuesto->fecha_hora); // ❌ Fatal error
```

**Fix sugerido:** corregir precedencia SQL + agregar guard `if ($ultimoPresupuesto)`.

---

## 8. Tickets de prueba usados

| ID | Estado | manoDeObra | fechaRealEntrega | Notas |
|---|---|---|---|---|
| 933717 | PRESUPUESTADO | 40 | NULL | TC-01 |
| 933718 | PRESUPUESTADO | 20 | NULL | TC-02 |
| 933719 | APROBADO | — | — | Creado por error, no usar |

---

## 9. Pendientes

- [ ] Re-ejecutar TC-01 a TC-04 una vez resuelto el bug de `sumarizarTotalesAprobados`
- [ ] Crear reporte QA VEC-3040 en Jira con todos los TCs en PASS
- [ ] Agregar TCs de otros ciclos de prueba a este documento
