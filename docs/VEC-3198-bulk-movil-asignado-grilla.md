# Grilla Móviles — Endpoint bulk vehículo reserva (VEC-3198)

## 1. ¿Qué hace esta feature?

Reemplaza las llamadas N+1 a `GET /moviles/movil-asignado/{id}` (una por fila en `MovilesGridRow.jsx`) por un único request bulk `GET /moviles/moviles-asignados?ids=...`. `MovilesGrid.jsx` hace el fetch una vez después de cargar la lista y pasa el resultado como prop `movilAsignado` a cada fila. Solo se ejecuta si `moviles.movil_reserva.habilitado = true`.

---

## 2. Impacto

- **Antes:** 25 requests simultáneos al cargar la grilla (1 por fila).
- **Después:** 1 request bulk con todos los IDs de la página.
- **Archivos modificados:** `MovilController.php`, `MovilesService.php`, `MovilRepository.php`, `MovilesGrid.jsx`, `MovilesGridRow.jsx`

---

## 3. Endpoints

Base: `https://vec-dev.vecfleet.io/ws/Public/index.php/api`  
Auth header: `Authorization-Token: <token>`

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/moviles/moviles-asignados?ids=1,2,3` | Retorna mapa `{ movil_id: dominio_titular }`. Solo aparecen los IDs que están asignados como reserva de otro vehículo. |

**Response:**
```json
{
  "codigo": 200,
  "mensaje": "OK",
  "data": { "4": "CPV6A93", "8": "NJZ4789" }
}
```

---

## 4. Lógica de negocio

- Un móvil puede ser **reserva** de otro (campo `movil_reserva_id`).
- El bulk endpoint retorna solo los que tienen asignación.
- Si `es_reserva_asignada = 1` en el móvil → la columna muestra "Asignado a [dominio]" (este vehículo está siendo USADO como reserva de otro → no puede asignarse a nadie más).
- Si `es_reserva_asignada = 0` → columna muestra dropdown para seleccionar/cambiar la reserva.

---

## 5. Casos de prueba

| CA | Descripción | Resultado esperado |
|---|---|---|
| CA2 | Cargar grilla con config `movil_reserva = true` | 1 request a `moviles-asignados?ids=...` en Network; ninguno a `movil-asignado/{id}` individual |
| CA3 | Columna "Vehículo Reserva" | Móviles asignados como reserva muestran "Asignado a [dominio]" |
| CA4 | Asignar/desasignar reserva | Dato se actualiza sin recargar la página |
| CA5a | Bulk con IDs mixtos | Retorna solo los asignados; el resto no aparece |
| CA5b | Bulk con IDs sin asignación | `data: []` |
| CA5c | Bulk con IDs inválidos mezclados | Filtra los no-enteros, procesa solo válidos |
| CA5d | Bulk sin param `ids` | HTTP 400 `"El parámetro ids es requerido"` |

---

## 6. Desasignar reserva

En el dropdown de "Vehículo Reserva" → seleccionar la opción **"Seleccione"** (primera de la lista) → llama `handleChangeMovilReserva(null, ...)`.

---

## 7. Data de prueba — vec-dev

| Dato | Valor |
|---|---|
| Config requerida | `moviles.movil_reserva.habilitado = true` (en vec-dev estaba en `false`) |
| Móviles asignados como reserva (primera página) | IDs 4 (CPV6A93), 5 (SDFJ-19-2), 8 (NJZ4789), 9 (NJZ5636) |
| Móviles que muestran dropdown (no son reserva) | IDs 2, 6, 7, 10, 20, 21 |

---

## 8. Gotchas

- **Config `false` en vec-dev:** el frontend no hace el bulk request y no muestra la columna. Habilitar vía DBeaver: `UPDATE \`vec-dev\`.config_business SET valor='true' WHERE seccion='moviles' AND parametro='movil_reserva';` (o el path exacto del config).
- **`es_reserva_asignada = 1` sin dropdown:** es comportamiento correcto — ese vehículo está ocupado como reserva de otro y no puede asignarse.
- **Desasignación:** usar opción "Seleccione" del dropdown, no hay botón de eliminar separado.

---

## 9. Resultados QA

| CA | Resultado | Fecha |
|---|---|---|
| CA2–CA4 | ✅ PASS (UI) | 2026-06-01 |
| CA5a–CA5d | ✅ PASS (API) | 2026-06-01 |

**QA Report:** VEC-3253
