# VEC-3270..3274 — Ciclo de vida del presupuesto (App móvil) — E2E API

Suite E2E **a nivel API** del ciclo de vida del presupuesto de un ticket
correctivo, contra los mismos endpoints que consume la app móvil de VecFleet.

## Qué cubre

Flujo de vida completo del presupuesto, de punta a punta:

| Card | Fase | Casos |
|------|------|-------|
| VEC-3270 | Visualización | TC1 vacío · TC2 items/totales/estado · TC3 consistencia app(items-activos) vs web(grid) |
| VEC-3271 | Carga inicial + envío | TC4 envío → transiciona · TC5 validación campo obligatorio (400) · TC6 eliminar item antes de enviar |
| VEC-3272 | Borrador | TC7 borrador MO no transiciona · TC8 borrador repuesto · TC9 promover borrador a presupuesto · TC10 eliminar item guardado |
| VEC-3273 | Aprobación | TC11 aprobación completa (auditor+aprobar) · TC12 rechazo total → recotizar · TC13 rechazo parcial c/motivo · TC14 rechazo parcial SIN motivo (400) |
| VEC-3274 | Adicional | TC15 cargar adicional → adic presupuestado · TC16 borrador adicional · TC17 aprobar adicional → APROBADO |

Cada caso afirma **estado PRE/POST**, la **transición** esperada y el **código HTTP**.

## Qué queda fuera de alcance

- **UI de la app móvil:** no es automatizable desde acá (requiere emulador o
  dispositivo físico). Esta suite valida el backend que la app consume; la
  validación visual la cubre QA manual sobre dispositivo (Sole).
- **Autoaprobación por monto:** vec-dev tiene `tickets.autoAprobacion.habilitado=false`,
  así que un monto bajo NO autoaprueba (queda pendiente de auditor). El caso solo
  es verificable en un tenant con autoAprobación ON (ej. teco-test, umbral 400k).
- **Permisos negativos (usuario sin permiso = solo lectura):** falta una credencial
  no-admin autenticable en vec-dev (servicio `/personas` deshabilitado). El
  enforcement de permisos de aprobación / cotizar adicional pasa por el mismo
  middleware ya cubierto en VEC-3231.

## Entorno y seguridad

- **vec-dev SOLO.** `lib/presupuesto-api.js` aborta al cargar si la URL base no
  apunta a `vec-dev.vecfleet.io`. Nunca producción.
- Auth: `POST /public/auth/login` con `usuario`/`clave`, token en `resp.usuario.token`,
  header `Authorization-Token`. Usuario `stineo`.

## Datos de prueba (vec-dev)

- Item MO `32` ("Mano De Obra Default", `costo_fijo=1`, precio fijo 1000).
- Item repuesto `1` ("DISCO DE CLUTCH", `costo_fijo=0`, precio libre).
- Clasificación `1` ("Original"). Servicio `1`.
- **Shape de escritura:** `presupuestoItems` con `costo` + `id_clasificacion`
  (NO `precio` / `id_item_clasificacion`).

## Idempotencia y limpieza

- Cada test crea su propio ticket vía `lib/ticket-factory.js`, que **rota el móvil**
  (round-robin sobre `moviles.json`) y reintenta si el móvil llegó a su tope
  `max_tickets`. Así la suite es re-ejecutable sin preparar datos a mano.
- `afterAll` cancela (best-effort) los tickets creados que no quedaron en estado
  terminal, para no dejar basura en vec-dev.

## Cómo correrla

```bash
# Toda la suite (la config app ya apunta a esta carpeta)
npx playwright test --config=playwright.app.config.js

# Un archivo puntual
npx playwright test tests/VEC-3270-3274-app-presupuesto/presupuesto-e2e.spec.js

# Con la config raíz (testDir = ./tests)
npx playwright test tests/VEC-3270-3274-app-presupuesto/ --reporter=list
```

> Nota: aunque corre con el runner de Playwright, **no abre navegador**: los tests
> hacen llamadas HTTP directas con `https`. Los `launchOptions` de la config app
> son inocuos acá.

## Estructura

```
VEC-3270-3274-app-presupuesto/
├── presupuesto-e2e.spec.js     # los 17 casos, agrupados por card
├── lib/
│   ├── presupuesto-api.js      # cliente HTTP + helpers de dominio + guard vec-dev
│   └── ticket-factory.js       # creación de tickets con rotación de móvil
├── moviles.json                # móviles activos de vec-dev (rotación)
└── README.md
```
