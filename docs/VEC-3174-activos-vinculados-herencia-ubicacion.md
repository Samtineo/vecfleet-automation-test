# Activos Vinculados — Herencia de ubicación y alerta visual (VEC-3174)

## 1. ¿Qué hace esta feature?

Dos mejoras sobre el módulo de asociación de activos:

1. **Herencia de ubicación:** cuando un activo asociado no tiene GPS propio (`sync_avl=false`), el sistema usa la ubicación del vehículo principal en todos los servicios que consultan posición (checklist, llantas, combustibles, infracciones, crons).

2. **Alerta visual en ABM:** en la sección "Dispositivo de GPS" del ABM de vehículos, si el activo es un asociado sin GPS propio, se muestra un aviso indicando que heredará la ubicación del principal y muestra su dominio.

---

## 2. Config requerida

```sql
UPDATE `vec-dev`.config_business 
SET valor = 'true' 
WHERE seccion = 'moviles' AND grupo = 'vinculacionActivos' AND parametro = 'habilitado';
```

---

## 3. Función clave (backend)

`MovilRelacionService::resolverDominioParaUbicacion(string $dominio): string`

```php
// Si sync_avl=false Y tiene relación activa → retorna dominio del principal
// Si sync_avl=true → retorna dominio propio (usa su propio GPS)
// Si config deshabilitada → retorna dominio original
```

Se aplica en: `ControlesService`, `ChecklistValidatePositionCron`, `InfraccionesController.getDireccionDetectadaAvl`, `CombustiblesRepository.getDireccionDetectadaAvl`, `LlantaInspeccion`, `TicketsRepository`.

---

## 4. Casos de prueba

### CA4 — Config deshabilitada: sin herencia
**Precondición:** `moviles.vinculacionActivos.habilitado = false`  
**Datos:** Movil 8 (NJZ4789, `sync_avl=false`) con relación activa → principal Movil 7 (SYX0I79)  
**Acción:** Cualquier consulta de posición del movil 8  
**Resultado esperado:** Comportamiento previo sin herencia (null si no hay GPS)  
**Estado:** ✅ PASS

---

### CA5 — Alerta visual: asociado sin GPS muestra aviso
**Precondición:** `vinculacionActivos.habilitado = true`  
**Datos:** Movil 8 (NJZ4789, `sync_avl=false`) asociado a Movil 7 (SYX0I79)  
**Acción:** Abrir ABM del movil 8 → sección "Dispositivo de GPS"  
**Resultado esperado:** Mensaje: *"Este activo heredará la ubicación del vehículo principal: SYX0I79"*  
**Estado:** ✅ PASS

---

### CA6 — Alerta visual: principal NO muestra aviso
**Precondición:** `vinculacionActivos.habilitado = true`  
**Datos:** Movil 7 (SYX0I79) es principal  
**Acción:** Abrir ABM del movil 7 → sección "Dispositivo de GPS"  
**Resultado esperado:** Sin mensaje de herencia  
**Estado:** ✅ PASS

---

### CA1 — Asociado sin GPS hereda posición del principal ⚠️ PENDIENTE
**Precondición:** `vinculacionActivos.habilitado = true` + backend deployado + AVL con datos activos  
**Datos:** Movil asociado (`sync_avl=false`) con relación activa → principal con GPS activo en Traccar  
**Acción:** Crear combustible para el asociado O correr `GET /crons/checklist/validate-positions`  
**Resultado esperado:** `latitud_detectada_avl` del combustible (u otro campo de posición) refleja coordenadas del principal, no del asociado  
**Estado:** ⚠️ BLOQUEADO (ver sección 5)

---

### CA2 — Asociado CON GPS usa su propia posición ⚠️ PENDIENTE
**Precondición:** Ídem CA1 + asociado con `sync_avl=true`  
**Resultado esperado:** `resolverDominioParaUbicacion` retorna dominio propio del asociado  
**Estado:** ⚠️ BLOQUEADO

---

### CA3 — Sin relación activa: no hereda ⚠️ PENDIENTE
**Precondición:** Config habilitada pero sin relación activa para el vehículo  
**Resultado esperado:** `resolverDominioParaUbicacion` retorna dominio propio  
**Estado:** ⚠️ BLOQUEADO

---

## 5. Bloqueos activos (pendiente respuesta dev)

### Bloqueo 1 — Contradicción en flujo de combustibles

El guard en `CombustiblesRepository.php` bloquea la detección AVL para vehículos con `sync_avl=false`:

```php
if(!empty($mov->getActivo()) && !empty($mov->getSyncAvl())){
    $getDireccionDetectadaAvl(...)  // solo ejecuta si sync_avl=true
}
```

Pero `resolverDominioParaUbicacion` solo hereda cuando `sync_avl=false`. Esto crea un conflicto: la herencia vía combustibles no se activa en ningún escenario.

**Pregunta al dev:** ¿El guard debe modificarse para también ejecutar para `sync_avl=false` cuando hay principal con GPS?

### Bloqueo 2 — Backend no deployado en vec-dev

La branch `feature/VEC-3174` no está mergeada a develop. Los cambios de backend (resolverDominioParaUbicacion en servicios) no están activos en vec-dev.

### Bloqueo 3 — Sin datos AVL activos para vehículos de prueba

Los vehículos Traccar disponibles en vec-dev (IDs 2338, 2342) devuelven `null` al consultar posición.

---

## 6. Setup de prueba para cuando se desbloquee

```bash
# 1. Verificar relación activa del movil de prueba
GET /movil-relaciones/activa?movil_id=8
# Debe retornar: activo_principal_id=2338, activo_asociado_id=8

# 2. Verificar que el principal tiene posición en Traccar
POST /crons/ubicacion/gps
# Body: dominio=<dominio_del_principal>
# Debe retornar lat/lon no null

# 3. Crear combustible para el asociado (movil 8)
POST /combustibles
# Body: movil[id]=8, fecha_hora_carga=<now>, litros=30, precio_litro=1000, importe=30000, combustibleTipo[value]=1

# 4. Verificar latitud_detectada_avl en el combustible creado
GET /combustibles/{id}
# latitud_detectada_avl debe reflejar coords del principal (Scania)
```

---

## 7. Data de prueba — vec-dev

| Dato | Valor |
|---|---|
| Movil asociado sin GPS | ID 8 (NJZ4789), `sync_avl=false` |
| Movil principal actual | ID 7 (SYX0I79) |
| Movil principal con Traccar | ID 2338 ("Traccar - Scania AR "), `sync_avl=true` |
| Config vinculación | `moviles.vinculacionActivos.habilitado` |

---

## 8. Estado del QA

| CA | Estado |
|---|---|
| CA4 (config=false) | ✅ PASS |
| CA5 (alerta visual asociado) | ✅ PASS |
| CA6 (alerta visual principal) | ✅ PASS |
| CA1 (herencia posición sin GPS) | ⚠️ Pendiente deploy + datos AVL + respuesta dev |
| CA2 (posición propia con GPS) | ⚠️ Pendiente |
| CA3 (sin relación = sin herencia) | ⚠️ Pendiente |
