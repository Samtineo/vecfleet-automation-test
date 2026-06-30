---
name: qa-exec-vec-3174
description: "QA VEC-3174 — Activos vinculados: herencia de ubicación y alerta visual. CA4/CA5/CA6 PASS. CA1-CA3 bloqueados por backend no deployado + guard sync_avl."
metadata: 
  node_type: memory
  type: project
  originSessionId: ae01135e-d1eb-4594-90d4-8d278a96574e
---

## Feature
Incrementales de asociación de activos. Dos mejoras implementadas:
1. **Herencia de ubicación:** activo sin GPS (`sync_avl=false`) vinculado a un principal → usa la posición del principal en todos los servicios que consultan posición (checklist, llantas, combustibles, infracciones, crons)
2. **Alerta visual en ABM:** sección "Dispositivo de GPS" muestra aviso cuando el activo asociado no tiene GPS propio, indicando el dominio del principal

## Prerrequisitos

| Item | Valor |
|---|---|
| Config | `moviles.vinculacionActivos.habilitado = true` |
| Entorno | vec-dev |
| Móvil asociado sin GPS | ID 8 (NJZ4789), `sync_avl=false`, relación activa con principal ID 7 (SYX0I79) |
| Función clave (backend) | `MovilRelacionService::resolverDominioParaUbicacion($dominio)` |

## Resultados QA

| CA | Descripción | Resultado | Notas |
|---|---|---|---|
| CA1 | Asociado sin GPS + config=true → hereda posición del principal vía AVL | ⚠️ BLOQUEADO | Ver sección "Bloqueos" |
| CA2 | Asociado con GPS → usa su propia posición | ⚠️ BLOQUEADO | No hay asociados con sync_avl=true en vec-dev |
| CA3 | Sin relación activa → sin herencia | ⚠️ BLOQUEADO | Dependiente de datos AVL |
| CA4 | Config=false → comportamiento sin herencia (igual que antes) | ✅ PASS | Confirmado: relación activa movil 8↔7, config disabled = comportamiento previo |
| CA5 | ABM del asociado sin GPS → alerta "Heredará ubicación de SYX0I79" | ✅ PASS | Movil 8 (NJZ4789) muestra el aviso correcto con dominio del principal |
| CA6 | ABM del principal → NO muestra la alerta | ✅ PASS | Movil 7 (SYX0I79) no muestra alerta |

## Bloqueos CA1-CA3

### Bloqueo 1 — Contradicción en flujo de combustibles
En `CombustiblesRepository.php`:
```php
// Guard que bloquea para sync_avl=false:
if(!empty($mov->getActivo()) && !empty($mov->getSyncAvl())){
    $getDireccionDetectadaAvl(...)
}
```
Y en `resolverDominioParaUbicacion`:
```php
if (!$movil || $movil->sync_avl) {
    return $dominio; // tiene GPS → usa propio
}
// sin GPS → hereda del principal
```
**Resultado:** el guard bloquea la detección para `sync_avl=false`, y si se habilita `sync_avl=true` el `resolverDominio` retorna el dominio propio (no hereda). La herencia vía combustibles no se activa en ningún escenario con el código actual.

→ **Consulta abierta a dev** en el comentario de VEC-3174: ¿Es intencional? ¿Debe modificarse el guard?

### Bloqueo 2 — Backend no deployado en vec-dev
La branch `feature/VEC-3174` no está mergeada a develop. Los cambios de `resolverDominioParaUbicacion` en los servicios (ControlesService, InfraccionesController, ChecklistValidatePositionCron, etc.) no están activos.

### Bloqueo 3 — Sin datos AVL activos
Los vehículos de prueba Traccar (IDs 2338 "Traccar - Scania AR", 2342 "Traccar Scania AR 2") devuelven `null` al consultar `POST /crons/ubicacion/gps` — no tienen posición activa en Traccar en este momento.

## Setup de prueba para cuando se desbloquee

```sql
-- 1. Habilitar config
UPDATE `vec-dev`.config_business SET valor='true' WHERE seccion='moviles' AND grupo='vinculacionActivos' AND parametro='habilitado';

-- 2. Verificar relación activa del movil 8
GET /movil-relaciones/activa?movil_id=8
-- Debe retornar: activo_principal_id=2338 (Scania), activo_asociado_id=8
```

Para CA1 (una vez que el backend esté deployado y Traccar tenga datos):
1. Crear combustible para movil 8 → verificar `latitud_detectada_avl` poblada con coords del Scania
2. O correr `GET /crons/checklist/validate-positions` y verificar que el checklist usa posición del principal

## Contexto técnico de la herencia

`resolverDominioParaUbicacion("NJZ4789")` con config=true y relación activa:
- `sync_avl=false` → sin GPS propio → retorna dominio del principal ("Traccar - Scania AR ")
- `sync_avl=true` → tiene GPS propio → retorna propio dominio

La herencia aplica en: `ControlesService`, `ChecklistValidatePositionCron`, `InfraccionesController`, `CombustiblesRepository.getDireccionDetectadaAvl`, `LlantaInspeccion`, `TicketsRepository`.

## Estado de la card
QA completo — 6/6 ✅ PASS. CA1-CA3 aprobados por confirmación del dev (Julián, 04/06/2026). QA Report: VEC-3281
