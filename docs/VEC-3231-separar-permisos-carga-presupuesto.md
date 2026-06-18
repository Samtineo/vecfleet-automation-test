# Separar permisos de carga de presupuesto por tipo de ítem (VEC-3231)

## 1. ¿Qué hace este feature?

Incorpora cuatro permisos granulares para controlar qué tipos de ítems puede cargar cada usuario al crear un borrador de presupuesto en un ticket correctivo. Antes del fix, cualquier usuario podía cargar tanto MO como repuestos con un único permiso genérico.

Los cuatro permisos nuevos son:

| Permiso | Aplica a | Cuándo |
|---|---|---|
| `TICKETS_PRESUPUESTO_BORRADOR_CREAR_MO` | Mano de obra | Presupuesto inicial (no existe aprobado previo) |
| `TICKETS_PRESUPUESTO_BORRADOR_CREAR_REPUESTO` | Repuestos | Presupuesto inicial |
| `TICKETS_PRESUPUESTO_BORRADOR_AGREGAR_MO` | Mano de obra | Presupuesto adicional (ya existe al menos un aprobado) |
| `TICKETS_PRESUPUESTO_BORRADOR_AGREGAR_REPUESTO` | Repuestos | Presupuesto adicional |

---

## 2. Endpoint principal

```
POST /ticket-presupuestos/ticket/{ticketId}/borrador
```

Base: `https://vec-dev.vecfleet.io/ws/Public/index.php/api`
Auth header: `Authorization-Token: <token>`

**Body:**
```json
{
  "items": [
    {
      "item_id": 32,
      "cantidad": 1,
      "precio_unitario": 100,
      "tarea_id": null
    }
  ]
}
```

**Consultar si ya existe un presupuesto aprobado (determina INICIAL vs ADICIONAL):**
```
GET /ticket-presupuestos/ticket/{ticketId}/grid
```
Verificar campo `existeAprobado` en la respuesta. Si es `false` aplican permisos CREAR; si es `true` aplican permisos AGREGAR.

**Consultar borradores activos:**
```
GET /ticket-presupuestos/ticket/{ticketId}/grid
```
El mismo endpoint muestra también los borradores pendientes junto al campo `existeAprobado`.

---

## 3. Diferencia INICIAL vs ADICIONAL

| Escenario | Campo `existeAprobado` | Permisos que se validan |
|---|---|---|
| Primer presupuesto del ticket | `false` | `CREAR_MO` y/o `CREAR_REPUESTO` |
| Presupuesto adicional (ya hay uno aprobado) | `true` | `AGREGAR_MO` y/o `AGREGAR_REPUESTO` |

---

## 4. Datos de prueba en vec-dev

| Recurso | Valor | Notas |
|---|---|---|
| Perfil solo MO (inicial) | 738 | Tiene `CREAR_MO`, sin `CREAR_REPUESTO` |
| Perfil solo repuesto (inicial) | 739 | Tiene `CREAR_REPUESTO`, sin `CREAR_MO` |
| Perfil ambos (inicial) | 740 | Tiene `CREAR_MO` + `CREAR_REPUESTO` |
| Item MO (tipoItemId=2) | ID 36 | Verificar que tenga `costo_fijo` != null |
| Item repuesto (tipoItemId=1) | ID 32 | Verificar que tenga `costo_fijo` != null |
| Usuario de prueba | `qa.valida1.1777496525018` | Asignar perfil según el CA |
| Ticket de prueba | 761 | Usado durante el QA; verificar estado en vec-dev |

> El usuario `qa.valida1.XXXX` puede haberse renombrado con otro sufijo timestamp. Si no existe, buscar un usuario similar con `GET /usuarios/grid?usuario=qa.valida`.

---

## 5. Config requerida

```
tickets.presupuesto.borrador.habilitado = true
tickets.trabajaConManoDeObra = true
```

Verificar en `GET /commons/config-business` antes de ejecutar.

---

## 6. Casos de prueba — 9/9 PASS (2026-06-16)

| CA | Descripción | Resultado esperado |
|---|---|---|
| CA1 | Usuario con ambos permisos CREAR: payload con MO + repuesto | HTTP 201, ambos ítems en borrador |
| CA2 | Usuario solo `CREAR_MO`: payload con MO + repuesto | HTTP 201, solo ítem MO persiste; repuesto descartado silenciosamente |
| CA3 | Usuario solo `CREAR_REPUESTO`: payload con MO + repuesto | HTTP 201, solo repuesto persiste; MO descartado |
| CA4 | Usuario sin ningún permiso CREAR: payload cualquiera | HTTP 403 con lista de permisos requeridos |
| CA5 | Config `borrador.habilitado=false`: request con permisos correctos | HTTP 400 o feature deshabilitado |
| CA6 | Usuario con `CREAR_MO` solo: payload solo MO | HTTP 201, ítem MO en borrador |
| CA7 | Usuario con `CREAR_REPUESTO` solo: payload solo repuesto | HTTP 201, ítem repuesto en borrador |
| CA8 | Usuario con ambos permisos AGREGAR (existe aprobado): payload mixto | HTTP 201, ambos ítems en borrador adicional |
| CA9 | Usuario sin ningún permiso AGREGAR (existe aprobado): payload cualquiera | HTTP 403 |

---

## 7. Gotchas

### 7.1 Enforcement silencioso — no es un bug

Cuando el usuario tiene AL MENOS UN permiso del endpoint, el status HTTP es 201 aunque se descarten ítems. El descarte es silencioso: no hay mensaje de error por los ítems ignorados. Para verificarlo hay que leer la respuesta y comprobar qué ítems quedaron.

Esto es **diferente al bug de FACTURAS_CERRAR** (VEC-3081), donde el 200 silencioso es un defecto de middleware no registrado. Aquí es comportamiento intencional documentado.

### 7.2 costo_fijo obligatorio

Los ítems 32 y 36 necesitan tener `costo_fijo` seteado en la tabla `items` de vec-dev. Si el POST al borrador retorna error de validación sobre precio, verificar este campo en DB antes de debuggear la lógica de permisos.

### 7.3 Username con timestamp

El usuario `qa.valida1.XXXX` fue creado con timestamp en el nombre. Si el entorno fue reiniciado o el usuario fue recreado, el sufijo numérico puede ser diferente. Siempre verificar con `GET /usuarios/grid?usuario=qa.valida`.

### 7.4 PATCH /personas no aplica perfil por ID

Para cambiar el perfil del usuario de prueba, usar el endpoint de asignación de perfil específico — no `PATCH /personas/{id}` con `perfil_id`. Este último no actualiza el perfil activo.

### 7.5 JSON parsing en payload

Si el body se construye como string en PowerShell y tiene caracteres especiales (barras en nombre de tarea, por ejemplo), verificar que el JSON sea válido antes de enviarlo. Errores de parsing retornan 400 sin indicar el campo inválido.

---

## 8. Smoke test

Para regresión rápida del feature, el candidato no-destructivo es:

```
GET /ticket-presupuestos/ticket/761/grid
Authorization-Token: {{token}}
```

Verifica que:
- El endpoint responde 200
- El campo `existeAprobado` está presente en la respuesta
- El array de borradores/presupuestos es accesible

Este request fue agregado a `vecfleet-smoke.postman_collection.json` como ítem en la sección `17 - Permisos Borrador Presupuesto (VEC-3231)`.

---

## 9. QA Report

VEC-3364 — https://vecfleet-kanban.atlassian.net/browse/VEC-3364
