# Grilla Móviles — Lazy load gestoría (VEC-3197)

## 1. ¿Qué hace esta feature?

Elimina las llamadas N+1 a `GET /tickets/gestoriaAbiertos/movil/{id}` que se hacían en el `useEffect` de montaje de cada fila de `MovilesGridRow.jsx`. El request ahora se hace de forma **lazy** (on demand) únicamente cuando el usuario intenta cambiar el estado de un móvil (`changeEstado()`). Si el estado destino está en `estadosActivos`, el check se saltea completamente.

---

## 2. Impacto

- **Antes:** 25 requests simultáneos al cargar la grilla (1 por fila).
- **Después:** 0 requests al cargar. Solo 1 request cuando el usuario interactúa.
- **Archivo modificado:** `MovilesGridRow.jsx`

---

## 3. Endpoint relevante

Base: `https://vec-dev.vecfleet.io/ws/Public/index.php/api`  
Auth header: `Authorization-Token: <token>`

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/tickets/gestoriaAbiertos/movil/{id}` | Retorna array de tickets de gestoría activos para ese móvil. `[]` si no tiene. |

---

## 4. Lógica de negocio

```js
const activo = estadosActivos.findIndex(e => e === estado) !== -1;
// Si el estado destino está en estadosActivos → skip del check
(activo ? Promise.resolve([]) : getTicketsGestoria(movil.id)).then(tickets => {
    if (!activo && tickets.length && permisosCancelarGestoria) {
        // Diálogo: ofrece cancelar tickets (no bloqueante si tiene permiso)
    } else if (!activo && tickets.length) {
        // Aviso bloqueante: cancelar manualmente antes de continuar
    }
    // Sin tickets → procede normalmente
})
```

`estadosActivos` viene del config `moviles.estadosActivos` (ej. `0KM,OPERATIVO,COMODATO,A REMATE`).

---

## 5. Casos de prueba

| CA | Descripción | Resultado esperado |
|---|---|---|
| CA6 | Cargar grilla de móviles | **Ningún** request a `gestoriaAbiertos` en Network tab |
| CA7 | Intentar inactivar móvil **CON** gestoría abierta (movil ID 6 en vec-dev) | Diálogo de detección aparece; request a `gestoriaAbiertos/movil/6` visible en Network |
| CA8 | Intentar inactivar móvil **SIN** gestoría (ej. ID 881) | Sin diálogo de gestoría; `gestoriaAbiertos/movil/881` retorna `[]` |

---

## 6. Data de prueba — vec-dev

| Dato | Valor |
|---|---|
| Móvil con gestoría abierta | ID 6 (TGRC-30) — ticket 417 estado ABIERTO |
| Móviles sin gestoría | IDs 871–881 (todos retornan `[]`) |

---

## 7. Gotchas

- **`PUT /moviles/{id}/estado` da 500 en vec-dev** para cualquier estado — problema de entorno preexistente. No bloquea la validación del lazy load (el request a gestoriaAbiertos sí se hace; el 500 es de la operación siguiente).
- El check solo aplica cuando el estado destino **no** está en `estadosActivos`. Cambiar a OPERATIVO, 0KM, COMODATO o A REMATE saltea el check siempre.

---

## 8. Resultados QA

| CA | Resultado | Fecha |
|---|---|---|
| CA6 | ✅ PASS | 2026-06-01 |
| CA7 | ✅ PASS | 2026-06-01 |
| CA8 | ✅ PASS | 2026-06-01 |

**QA Report:** VEC-3253
