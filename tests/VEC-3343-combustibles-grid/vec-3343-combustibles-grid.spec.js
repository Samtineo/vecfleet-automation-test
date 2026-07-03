// VEC-3343 — Grilla de Cargas de Combustible: filtros (conductor/tarjeta/proveedor),
// columna Proveedor ordenable, tooltip de tarjeta (con/sin) y export con columnas nuevas.
// Entorno: vec-dev. Login stineo/susy1234. NO probar en producción.
//
// Suite OBSERVABLE: trace/video/screenshot ON, retries 0, timeouts cortos en waits
// y console.log en cada aserción (se ven con --reporter=list).
//
// GOTCHA: la grilla filtra por período (default "Este año", id=365). Antes de validar
// filtros seteamos "Todo" (id=0) para no perder datos dispersos 2024-2027.
//
// Datos reales verificados por API en vec-dev:
//  - conductor_informado: contiene "MENDIZABAL"
//  - tarjeta_numero: "1-246520-00175-3-3"
//  - proveedor_carga: "PetroTest"

const { test, expect } = require('@playwright/test');
const { LoginPage } = require('./pages/LoginPage');
const { CombustiblesGridPage } = require('./pages/CombustiblesGridPage');

// ── Observabilidad + anti-loop (requisito de esta corrida) ─────────────────
test.use({ trace: 'on', video: 'on', screenshot: 'on' });
test.describe.configure({ retries: 0 });

const CREDENTIALS = { username: 'stineo', password: 'susy1234' };
const FILTRO_CONDUCTOR = 'MENDIZABAL';
const FILTRO_TARJETA = '1-246520-00175-3-3';
const FILTRO_PROVEEDOR = 'PetroTest';

// Columnas nuevas esperadas en el export (VEC-3343), AL FINAL del listado.
const COLS_NUEVAS = [
  'Tarjeta utilizada',
  'Control Ubicación',
  'Control Tanque',
  'Control Rendimiento',
  'Control Tarjeta',
  'Control Distancia',
];

test.describe('VEC-3343 — Grilla Cargas de Combustible', () => {
  test.setTimeout(150000);

  let grid;

  test.beforeEach(async ({ page }) => {
    const login = new LoginPage(page);
    await login.login(CREDENTIALS.username, CREDENTIALS.password);
    grid = new CombustiblesGridPage(page);
    await grid.ir();
    await grid.setRangoAmplio();
    await grid.buscar();
    console.log('[setup] Grilla /combustibles cargada con período "Todo".');
  });

  // CA01 — Filtrar por conductor → sólo filas de ese conductor.
  // NOTA: en vec-dev la columna "Conductor Informado" está deshabilitada en la grilla,
  // por eso validamos el filtro por su efecto: reduce el listado y trae ≥1 fila.
  test('CA01 | Filtro por conductor (MENDIZABAL) acota el listado', async () => {
    const sinFiltro = await grid.cantidadFilas();
    console.log('CA01 sin filtro -> filas (página):', sinFiltro);

    await grid.filtrarPorConductor(FILTRO_CONDUCTOR);
    const conFiltro = await grid.cantidadFilas();
    console.log('CA01 filtro conductor', FILTRO_CONDUCTOR, '-> filas:', conFiltro);
    expect(conFiltro, 'El filtro de conductor debe traer ≥1 fila').toBeGreaterThan(0);

    // El filtro discrimina: el total (paginación "de N") baja al filtrar por un conductor.
    const totalConFiltro = await grid.totalPaginacion();
    console.log('CA01 total paginación con filtro conductor:', totalConFiltro);
    await grid.limpiarConductor();
    const totalSinFiltro = await grid.totalPaginacion();
    console.log('CA01 total paginación sin filtro:', totalSinFiltro);
    expect(totalConFiltro, 'El total filtrado debe ser menor al total sin filtro').toBeLessThan(totalSinFiltro);
  });

  // CA02 — Limpiar filtro de conductor → vuelve a mostrar más filas.
  test('CA02 | Limpiar filtro de conductor restaura el listado completo', async () => {
    await grid.filtrarPorConductor(FILTRO_CONDUCTOR);
    const conFiltro = await grid.cantidadFilas();
    console.log('CA02 con filtro conductor -> filas:', conFiltro);

    await grid.limpiarConductor();
    const sinFiltro = await grid.cantidadFilas();
    console.log('CA02 sin filtro conductor -> filas:', sinFiltro);

    expect(sinFiltro, 'Sin filtro no puede haber menos filas').toBeGreaterThanOrEqual(conFiltro);
    expect(sinFiltro, 'Sin filtro debe haber más filas que con un único conductor').toBeGreaterThan(conFiltro);
  });

  // CA03 — Filtrar por tarjeta → sólo esas filas.
  test('CA03 | Filtro por tarjeta muestra sólo cargas de esa tarjeta', async () => {
    await grid.filtrarPorTarjeta(FILTRO_TARJETA);
    const total = await grid.cantidadFilas();
    console.log('CA03 filtro tarjeta', FILTRO_TARJETA, '-> filas:', total);
    expect(total, 'Debe haber ≥1 fila con la tarjeta filtrada').toBeGreaterThan(0);

    // Todas las filas visibles deben tener un control de tarjeta (tooltip presente).
    let conControl = 0;
    for (let r = 0; r < total; r++) {
      const tt = await grid.tooltipTarjetaFila(r);
      if (tt !== null) conControl++;
    }
    console.log('CA03 filas con control de tarjeta (tooltip presente):', conControl, '/', total);
    expect(conControl, 'Todas las filas del filtro deben exponer el control de tarjeta').toBe(total);
  });

  // CA04 — Filtrar por proveedor + columna Proveedor presente y ordenable.
  test('CA04 | Filtro por proveedor (PetroTest) y columna Proveedor ordenable', async () => {
    const idxProveedor = await grid.columnaIndex('Proveedor');
    console.log('CA04 índice columna Proveedor:', idxProveedor);
    expect(idxProveedor, 'La columna Proveedor debe existir en el header').toBeGreaterThanOrEqual(0);

    await grid.filtrarPorProveedor(FILTRO_PROVEEDOR);
    const total = await grid.cantidadFilas();
    const valores = await grid.valoresColumna('Proveedor');
    console.log('CA04 filtro proveedor', FILTRO_PROVEEDOR, '-> filas:', total, 'valores:', JSON.stringify(valores));
    expect(total, 'Debe haber ≥1 fila con el proveedor filtrado').toBeGreaterThan(0);
    for (const v of valores) {
      expect(v.toLowerCase()).toContain(FILTRO_PROVEEDOR.toLowerCase());
    }

    // Ordenable: el src del ícono de sort cambia entre clicks (asc/desc).
    const src1 = await grid.clickSortProveedor();
    const src2 = await grid.clickSortProveedor();
    console.log('CA04 sort Proveedor -> src1:', src1, '| src2:', src2);
    expect(src1, 'El ícono de sort debe existir').not.toBeNull();
    expect(src1, 'El ícono de sort debe cambiar de estado al reordenar').not.toEqual(src2);
  });

  // CA05 — Combinar dos filtros → intersección correcta.
  test('CA05 | Combinar conductor + proveedor da la intersección', async () => {
    await grid.filtrarPorConductor(FILTRO_CONDUCTOR);
    const soloConductor = await grid.cantidadFilas();
    console.log('CA05 sólo conductor', FILTRO_CONDUCTOR, '-> filas:', soloConductor);
    expect(soloConductor, 'El filtro simple de conductor debe traer filas').toBeGreaterThan(0);

    await grid.abrirFiltros();
    await grid.inputProveedor.fill('Ultragas');
    await grid.buscar();
    const ambos = await grid.cantidadFilas();
    console.log('CA05 conductor + proveedor(Ultragas) -> filas:', ambos);

    expect(ambos, 'La intersección no puede exceder al filtro simple').toBeLessThanOrEqual(soloConductor);

    const conductores = await grid.valoresColumna('Conductor');
    const proveedores = await grid.valoresColumna('Proveedor');
    console.log('CA05 intersección — conductores:', JSON.stringify(conductores), '| proveedores:', JSON.stringify(proveedores));
    for (const c of conductores) expect(c.toUpperCase()).toContain(FILTRO_CONDUCTOR);
    for (const p of proveedores) expect(p.toLowerCase()).toContain('ultragas');
  });

  // CA06 — Fila CON tarjeta → el control de tarjeta expone "Tarjeta: {numero}".
  // NOTA: el número sólo aparece cuando el control es INVALIDA/SIN_COMPROBACION con
  // tarjeta cargada; las cargas VÁLIDAS sólo dicen "Carga realizada con tarjeta". Por
  // eso NO filtramos por una tarjeta concreta (esas dan válidas), sino que recorremos
  // el listado amplio buscando una fila que exponga el número.
  test('CA06 | Fila con tarjeta: el tooltip del control incluye el número', async () => {
    const total = await grid.cantidadFilas();
    console.log('CA06 filas en primera página (rango amplio):', total);
    expect(total, 'Debe haber filas para inspeccionar el tooltip').toBeGreaterThan(0);

    let ttHallado = null;
    for (let r = 0; r < total; r++) {
      const tt = await grid.tooltipTarjetaFila(r);
      console.log('CA06 fila', r, 'tooltip tarjeta:', tt);
      if (tt && /Tarjeta:\s*\S+/i.test(tt)) {
        ttHallado = tt;
        break;
      }
    }
    expect(ttHallado, 'Debe existir una fila con tooltip "Tarjeta: {numero}"').not.toBeNull();
    console.log('CA06 tooltip con número hallado:', ttHallado);
    expect(ttHallado).toMatch(/Tarjeta:\s*\S+/i);
  });

  // CA07 — Fila SIN tarjeta → tooltip muestra el mensaje y NO el número.
  test('CA07 | Fila sin tarjeta: el tooltip dice "sin tarjeta" y no muestra número', async () => {
    // Con rango amplio y sin filtro, recorremos las filas de la primera página
    // buscando un control de tarjeta que indique carga sin tarjeta.
    const totalFilas = await grid.cantidadFilas();
    console.log('CA07 filas en primera página (sin filtro):', totalFilas);

    let detalle = null;
    for (let r = 0; r < totalFilas; r++) {
      const tt = await grid.tooltipTarjetaFila(r);
      if (tt && /sin tarjeta de combustible/i.test(tt)) {
        detalle = tt;
        console.log('CA07 fila', r, 'tooltip sin tarjeta:', tt);
        break;
      }
    }

    if (!detalle) {
      console.log('CA07 NO-EJECUTABLE: ninguna fila de la primera página tiene "sin tarjeta de combustible".');
      test.info().annotations.push({
        type: 'no-ejecutable',
        description: 'No se halló fila con "sin tarjeta de combustible" en la primera página con rango amplio. Requiere dato específico o paginar.',
      });
      test.skip(true, 'No hay fila sin tarjeta visible en la primera página; marcar como no ejecutable.');
    }

    console.log('CA07 aserción sobre tooltip sin tarjeta:', detalle);
    expect(detalle).toMatch(/sin tarjeta de combustible/i);
    expect(detalle, 'El tooltip sin tarjeta no debe contener número de tarjeta').not.toMatch(/Tarjeta:\s*\d/);
  });

  // CA08 — Export incluye las columnas nuevas AL FINAL, sin alterar el orden previo.
  test('CA08 | Export: columnas nuevas presentes y al final del listado', async () => {
    await grid.abrirModalExport();
    await grid.tildarColumnasNuevas();
    const res = await grid.exportarYLeerXlsx();
    console.log('CA08 archivo:', res.filename);
    console.log('CA08 headers:', JSON.stringify(res.headers));

    expect(res.filename, 'El export debe ser un .xlsx de combustibles').toMatch(/combustibles.*\.xlsx$/i);

    const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const headersNorm = res.headers.map(norm);
    const idxNuevas = [];
    for (const col of COLS_NUEVAS) {
      const idx = headersNorm.findIndex((h) => h.includes(norm(col)));
      console.log('CA08 columna nueva', col, '-> índice en export:', idx);
      expect(idx, `Falta columna nueva en el export: ${col}`).toBeGreaterThanOrEqual(0);
      idxNuevas.push(idx);
    }

    // Deben estar AL FINAL: el mínimo índice de las nuevas > máximo índice de las viejas.
    const setNuevas = new Set(idxNuevas);
    const idxViejas = res.headers.map((_, i) => i).filter((i) => !setNuevas.has(i));
    const maxViejo = Math.max(...idxViejas);
    const minNuevo = Math.min(...idxNuevas);
    console.log('CA08 maxIdxViejo:', maxViejo, '| minIdxNuevo:', minNuevo);
    expect(minNuevo, 'Las columnas nuevas deben quedar al final').toBeGreaterThan(maxViejo);
  });

  // CA09 — Export con filtro activo → respeta el filtro (menos filas que el total).
  // NOTA: el modal de export NO ofrece la columna "Proveedor", por eso validamos que
  // el export honre el filtro comparando la cantidad de filas exportadas con y sin él.
  test('CA09 | Export con filtro de proveedor activo respeta el filtro', async () => {
    // Export sin filtro (rango amplio) para tener la referencia de total.
    await grid.abrirModalExport();
    const resTodo = await grid.exportarYLeerXlsx();
    const filasTodo = resTodo.dataRows.length;
    console.log('CA09 export SIN filtro -> filas:', filasTodo);
    expect(filasTodo, 'El export sin filtro debe traer filas').toBeGreaterThan(0);

    // Export con filtro de proveedor.
    await grid.filtrarPorProveedor(FILTRO_PROVEEDOR);
    const enGrilla = await grid.totalPaginacion();
    console.log('CA09 total paginación con filtro', FILTRO_PROVEEDOR, ':', enGrilla);
    await grid.abrirModalExport();
    const resFiltro = await grid.exportarYLeerXlsx();
    const filasFiltro = resFiltro.dataRows.length;
    console.log('CA09 export CON filtro', FILTRO_PROVEEDOR, '-> filas:', filasFiltro);

    expect(filasFiltro, 'El export con filtro debe traer filas').toBeGreaterThan(0);
    expect(filasFiltro, 'El export con filtro debe traer menos filas que sin filtro').toBeLessThan(filasTodo);
    // Coherencia: las filas exportadas coinciden con el total del filtro en la grilla.
    expect(filasFiltro, 'Las filas exportadas deben coincidir con el total filtrado de la grilla').toBe(enGrilla);
  });
});
