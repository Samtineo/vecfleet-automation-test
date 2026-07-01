// VEC-3297 — Tickets | Generación masiva desde móviles - No funciona
// Bug de FRONTEND (hotfix, PR #2138, commit 88814dd34). Validación por UI (Playwright).
//
// Contexto del fix (MovilesGrid.jsx -> generarCorrectivos):
//  - Rama multi-móvil: antes navegaba con setRedirectTo({pathname:'/correctivos/add/moviles',
//    state:{moviles}}). Con `history` v5 instalada (mismatch vs react-router-dom v4), el `state`
//    embebido en push({pathname,state}) se descartaba => location.state.moviles llegaba null a
//    CorrectivosAbm y la pantalla de Crear Correctivo mostraba el Select de móviles VACÍO.
//    El fix usa props.history.push('/correctivos/add/moviles', {moviles: selectedMoviles})
//    (firma push(path, state)), que conserva el state en v4 y v5.
//  - Rama 1 móvil: antes tomaba selectedMoviles[0] (objeto) como id => TypeError. Ahora usa
//    movil.id + movil.dominio y navega a /correctivos/add/movil/{id}/{dominio}.
//
// CA1 (EL FIX, multi-móvil): seleccionar 2+ móviles en la grilla -> llave (fa-wrench) ->
//    la pantalla Crear Correctivo LISTA los dominios seleccionados (Select multi #moviles poblado).
// CA2 (rama 1 móvil): seleccionar 1 móvil -> llave -> navega a /correctivos/add/movil/{id}/{dominio}
//    sin error, con ese móvil.
// CA3 (regresión grilla, Arqueólogo VEC-3197/3198): la grilla carga y la selección múltiple
//    togglea el header "N Seleccionados" con la llave visible.
//
// Prerrequisito de config: tickets.generacionMasiva.habilitado = "true".
// Verificado por API en vec-hotfix (2026-07-01): ON. Si estuviera OFF, no aparecen los checkboxes
// ni la llave y CA1/CA2 no son ejecutables (config master-driven, no togglear).
//
// Entorno: vec-hotfix (entorno de TEST, contiene -hotfix; NO producción).

const { test, expect } = require('@playwright/test');
const { LoginPage } = require('./pages/LoginPage');

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://vec-hotfix.vecfleet.io';
const CREDENTIALS = {
  username: process.env.VEC_USER || 'stineo',
  password: process.env.VEC_PASS || 'susy1234',
};

const GRID_PATH = '/moviles';

// Selectores reales (del código fuente vec-fleet-web):
const SEL = {
  // MovilesGridRow.jsx:742 — checkbox por fila. id={movil.id}, class customCheckbox.
  // Solo se renderiza cuando generacionMasiva === true (config prerrequisito).
  // IMPORTANTE: se scopea a tbody porque el header también tiene un customCheckbox
  // "Seleccionar Todos" (MovilesGrid.jsx:793) que puede venir pre-checked.
  rowCheckbox: 'tbody input.customCheckbox',
  // Selector amplio (header + filas) sólo para el chequeo de prerrequisito de config.
  anyCheckbox: 'input.customCheckbox',
  // MovilesGrid.jsx:762-776 — "llave" (fa-wrench) para generar correctivos masivos. Aparece en
  // el TableHead sólo cuando selectedMoviles.length > 0, con tooltip title="Crear Correctivos".
  // OJO: hay otros fa-wrench por fila con title="Crear Nuevo Mantenimiento"; desambiguar por título.
  llaveGenerarCorrectivo: 'i.fa-wrench[title="Crear Correctivos"]',
  // MovilesGrid.jsx:759-760 — contador "N Seleccionados" en el header de selección.
  seleccionadosHeader: 'text=/Seleccionados/i',
  // CorrectivosAbm.js:1927-1943 — Select multi id="moviles" (react-select v1, clases .Select-*).
  movilesLabel: 'label[for="moviles"]',
};

// Ancla robusta para el react-select v1 de móviles: el .Select hermano dentro del form-group
// que contiene el <label htmlFor="moviles">. En v1 el id="moviles" NO cae en el div raíz .Select.
function movilesSelect(page) {
  return page.locator('.form-group:has(label[for="moviles"]) .Select');
}
function movilesChips(page) {
  return movilesSelect(page).locator('.Select-value .Select-value-label');
}

test.use({ baseURL: BASE_URL });

async function irAGrillaMoviles(page) {
  const login = new LoginPage(page);
  await login.login(CREDENTIALS.username, CREDENTIALS.password);
  await page.goto(GRID_PATH);
  // Esperar que la carga inicial de la grilla termine: aparecen filas con checkbox de selección.
  await page.locator(SEL.rowCheckbox).first().waitFor({ state: 'visible', timeout: 30000 });
}

// Selecciona el móvil de fila índice `i`. Usamos .click() (no .check()) porque el checkbox es un
// input controlado de React con onChange={handleChecked(movil)}: .check() es idempotente y si el
// DOM ya lo reporta "checked" no dispara el onChange, dejando selectedMoviles desincronizado.
async function seleccionarMovil(page, i) {
  await page.locator(SEL.rowCheckbox).nth(i).click();
}

test.describe('VEC-3297 — Generación masiva de correctivos desde grilla de Móviles', () => {
  test.setTimeout(120000);

  test('Prerrequisito de config: los checkboxes de generación masiva están presentes en la grilla', async ({ page }) => {
    await irAGrillaMoviles(page);
    // Si tickets.generacionMasiva.habilitado === 'false', esta cuenta sería 0 (no se renderiza
    // la columna de selección) y CA1/CA2 no serían ejecutables.
    const checks = page.locator(SEL.anyCheckbox);
    await expect
      .poll(async () => await checks.count(), {
        message: 'No aparecen checkboxes de selección => generación masiva OFF (config prerrequisito)',
        timeout: 15000,
      })
      .toBeGreaterThan(0);
  });

  test('CA1 (EL FIX) — multi-móvil: Crear Correctivo lista los dominios seleccionados', async ({ page }) => {
    await irAGrillaMoviles(page);

    const checks = page.locator(SEL.rowCheckbox);
    const total = await checks.count();
    expect(total, 'Se necesitan >=2 móviles en la grilla para el caso multi-móvil').toBeGreaterThanOrEqual(2);

    // Seleccionar los 2 primeros móviles de fila (evitamos el "seleccionar todos" del header).
    await seleccionarMovil(page, 0);
    await seleccionarMovil(page, 1);

    // Al haber selección, el header muestra "N Seleccionados" y aparece la llave.
    await expect(page.locator(SEL.seleccionadosHeader).first()).toBeVisible({ timeout: 10000 });
    const llave = page.locator(SEL.llaveGenerarCorrectivo);
    await expect(llave).toBeVisible({ timeout: 10000 });

    // Presionar la llave -> navegación client-side (react-router Redirect push) a /correctivos/add/moviles.
    await Promise.all([
      page.waitForURL(/\/correctivos\/add\/moviles/, { timeout: 20000 }),
      llave.click(),
    ]);

    // La pantalla de Crear Correctivo debe estar lista (label del Select de móviles presente).
    await page.locator(SEL.movilesLabel).waitFor({ state: 'visible', timeout: 20000 });

    // CORAZÓN DEL FIX: el Select multi de móviles debe estar POBLADO con los dominios seleccionados.
    // Antes del fix (state descartado por history v5) este Select salía VACÍO -> count 0.
    const chips = movilesChips(page);
    await expect(chips).toHaveCount(2, { timeout: 15000 });

    // Cada chip debe tener un dominio no vacío (label = movil.dominio).
    const textos = (await chips.allTextContents()).map((t) => t.trim()).filter(Boolean);
    expect(textos.length, 'Los chips de dominios no deben estar vacíos').toBe(2);
    // El control debe ser multi y disabled (read-only, precargado desde la grilla).
    // react-select v1: clase del multi es "Select--multi"; el poblado agrega "has-value".
    await expect(movilesSelect(page)).toHaveClass(/Select--multi/);
    await expect(movilesSelect(page)).toHaveClass(/is-disabled/);
    await expect(movilesSelect(page)).toHaveClass(/has-value/);
  });

  test('CA2 (rama 1 móvil): navega a /correctivos/add/movil/{id}/{dominio} sin error', async ({ page }) => {
    await irAGrillaMoviles(page);

    const checks = page.locator(SEL.rowCheckbox);
    expect(await checks.count()).toBeGreaterThanOrEqual(1);

    // Seleccionar exactamente 1 móvil.
    await seleccionarMovil(page, 0);

    // Al haber selección, el header muestra "N Seleccionados" y aparece la llave.
    await expect(page.locator(SEL.seleccionadosHeader).first()).toBeVisible({ timeout: 10000 });
    const llave = page.locator(SEL.llaveGenerarCorrectivo);
    await expect(llave).toBeVisible({ timeout: 10000 });

    // Rama single: URL /correctivos/add/movil/{id}/{dominio} (params, no state).
    await Promise.all([
      page.waitForURL(/\/correctivos\/add\/movil\/\d+\//, { timeout: 20000 }),
      llave.click(),
    ]);

    // La pantalla de Crear Correctivo cargó sin pantalla de error (antes: TypeError al usar objeto como id).
    // El formulario de correctivo se identifica por el selector de entidad/campos del ABM.
    await expect(page).toHaveURL(/\/correctivos\/add\/movil\/\d+\//);
    // No debe haberse redirigido a /error.
    await expect(page).not.toHaveURL(/\/error/);
    // Debe existir contenido de formulario de correctivo (no una pantalla en blanco/error).
    await expect(page.locator('form.form-horizontal').first()).toBeVisible({ timeout: 20000 });
    // El ABM de correctivo muestra la entidad "Movil" seleccionada (no rompió por TypeError).
    await expect(page.locator('label[for="base"]').first()).toBeVisible({ timeout: 20000 });
  });

  test('CA3 (regresión grilla): la selección múltiple togglea el header de seleccionados', async ({ page }) => {
    await irAGrillaMoviles(page);

    await seleccionarMovil(page, 0);
    // El header de selección aparece y la llave queda visible.
    await expect(page.locator(SEL.seleccionadosHeader).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator(SEL.llaveGenerarCorrectivo)).toBeVisible({ timeout: 10000 });
  });
});
