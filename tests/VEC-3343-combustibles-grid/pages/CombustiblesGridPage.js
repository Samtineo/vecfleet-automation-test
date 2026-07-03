// Page Object — Grilla de Cargas de Combustible (VEC-3343)
// Componente: src/components/combustibles/CombustiblesGridNew.js
//
// Notas de selectores (verificados contra el componente):
//  - Toggle de panel de filtros: div con title="Filtros" (ícono ExpandMore/Up).
//  - Período: react-select id="periodo". Opción "Todo" = rango más amplio.
//  - Filtros: input[name="conductorInformadoFilter" | "tarjetaFilter" | "proveedorCargaFilter"].
//  - Botón Buscar: button.btn-primary con texto "Buscar".
//  - Reset de filtros: ícono <i class="las la-times"> dentro del chip de resultados
//    (aparece sólo con filtros activos). También hay reset por período="Todo".
//  - Header Proveedor: div con onClick requestSort("proveedorCargaSort"); el <img> de sort
//    cambia src entre sort/sort-asc/sort-desc (query.proveedorCargaSort "", "asc", "desc").
//  - Tooltip de tarjeta (col Controles): <i class="fa fa-credit-card ..."> cuyo contenedor
//    tiene data-original-title con "Tarjeta: {num}" o "La carga se realizó sin tarjeta...".
//  - Export: button.buttons-collection[data-target="#export_modal"] abre #export_modal.
//    Switches por id/name: tarjeta, controlUbicacion, controlTanque, controlRendimiento,
//    controlTarjeta, controlDistancia. Descarga => "fleet-combustibles.xlsx".

const XLSX = require('xlsx');

class CombustiblesGridPage {
  constructor(page) {
    this.page = page;

    this.GRID_PATH = '/combustibles';

    // Panel de filtros. El toggle es un div.btn-grey-blue con onClick=handleChange
    // y title (formatMessage "Filtros"). Fallback: el botón redondo gris de la barra.
    this.filtrosToggle = page.locator('div[title="Filtros"], div.btn-grey-blue.btn-round');
    this.periodoSelect = page.locator('#periodo');
    this.inputConductor = page.locator('input[name="conductorInformadoFilter"]');
    this.inputTarjeta = page.locator('input[name="tarjetaFilter"]');
    this.inputProveedor = page.locator('input[name="proveedorCargaFilter"]');
    this.btnBuscar = page.locator('button.btn-primary:has-text("Buscar")');

    // Tabla
    this.tabla = page.locator('table[aria-label="collapsible table"]');
    this.filas = this.tabla.locator('tbody tr');

    // Header Proveedor (sortable)
    this.headerProveedor = page.locator('div', { hasText: /^Proveedor$/ })
      .filter({ has: page.locator('img') });

    // Export
    this.btnAbrirExport = page.locator('button.buttons-collection[data-target="#export_modal"]');
    this.exportModal = page.locator('#export_modal');
    this.btnExportarExcel = page.locator('#export_modal .modal-footer button.btn-fleet');
  }

  async ir() {
    await this.page.goto(this.GRID_PATH);
    // Esperar a que la grilla monte (la tabla o el botón de export existen)
    await this.btnAbrirExport.waitFor({ state: 'visible', timeout: 25000 });
    await this._esperarSinLoading();
  }

  async _esperarSinLoading() {
    // El spinner de carga usa clase spinner; esperar a que no haya ninguno visible.
    const spinner = this.page.locator('.la-spinner.spinner, .fa-spinner.spinner');
    try {
      await spinner.first().waitFor({ state: 'hidden', timeout: 20000 });
    } catch (e) { /* puede no existir nunca; ok */ }
    await this.page.waitForTimeout(400);
  }

  async abrirFiltros() {
    // Si el botón Buscar ya está visible, el panel está abierto.
    if (await this.btnBuscar.isVisible().catch(() => false)) return;
    await this.filtrosToggle.first().click();
    await this.btnBuscar.waitFor({ state: 'visible', timeout: 10000 });
  }

  // Selecciona una opción del react-select de período por su label visible.
  async seleccionarPeriodo(label) {
    // react-select v1: el wrapper .select-periodo-filter contiene .Select-control.
    const control = this.page.locator('.select-periodo-filter .Select-control').first();
    await control.waitFor({ state: 'visible', timeout: 10000 });
    await control.click();
    // Las opciones son .Select-option
    const opcion = this.page.locator('.Select-option', { hasText: new RegExp('^\\s*' + label + '\\s*$') });
    await opcion.first().waitFor({ state: 'visible', timeout: 8000 });
    await opcion.first().click();
    await this.page.waitForTimeout(400);
  }

  // Setea el rango más amplio disponible ("Todo" = sin filtro de período).
  async setRangoAmplio() {
    await this.abrirFiltros();
    await this.seleccionarPeriodo('Todo');
  }

  async buscar() {
    await this.btnBuscar.click();
    await this._esperarSinLoading();
  }

  async filtrarPorConductor(valor) {
    await this.abrirFiltros();
    await this.inputConductor.fill('');
    await this.inputConductor.fill(valor);
    await this.buscar();
  }

  async filtrarPorTarjeta(valor) {
    await this.abrirFiltros();
    await this.inputTarjeta.fill('');
    await this.inputTarjeta.fill(valor);
    await this.buscar();
  }

  async filtrarPorProveedor(valor) {
    await this.abrirFiltros();
    await this.inputProveedor.fill('');
    await this.inputProveedor.fill(valor);
    await this.buscar();
  }

  async limpiarConductor() {
    await this.abrirFiltros();
    await this.inputConductor.fill('');
    await this.buscar();
  }

  async cantidadFilas() {
    return this.filas.count();
  }

  // Lee el total del pie de paginación: "Mostrando X a Y de N" -> N.
  async totalPaginacion() {
    const cap = this.page.locator('.MuiTablePagination-caption, [class*="TablePagination-caption"]')
      .filter({ hasText: /de\s+\d+/ }).last();
    const txt = (await cap.innerText()).trim();
    const m = txt.match(/de\s+(\d+)/i);
    return m ? parseInt(m[1], 10) : NaN;
  }

  // Devuelve el texto de una columna (por header) para todas las filas visibles.
  // Usa índices de columna resueltos por posición del header.
  async columnaIndex(nombreHeader) {
    const headers = this.tabla.locator('thead th');
    const n = await headers.count();
    for (let i = 0; i < n; i++) {
      const t = (await headers.nth(i).innerText()).trim();
      if (t.toLowerCase().includes(nombreHeader.toLowerCase())) return i;
    }
    return -1;
  }

  // Lee una columna por header. GOTCHA: el thead tiene 1 columna más que el tbody
  // (una columna condicional queda sin celda), por eso alineamos por distancia al
  // FINAL: celdaIdx = headerIdx - (headerCount - cellCount). Para columnas cercanas
  // al final (Proveedor, Conductor) esto es exacto.
  async valoresColumna(nombreHeader) {
    const headerIdx = await this.columnaIndex(nombreHeader);
    if (headerIdx < 0) return [];
    const headerCount = await this.tabla.locator('thead th').count();
    const total = await this.filas.count();
    if (total === 0) return [];
    const cellCount = await this.filas.first().locator('td').count();
    const offset = headerCount - cellCount; // normalmente 1
    const cellIdx = headerIdx - offset;
    if (cellIdx < 0) return [];
    const out = [];
    for (let r = 0; r < total; r++) {
      const cel = this.filas.nth(r).locator('td').nth(cellIdx);
      out.push(((await cel.innerText()) || '').trim());
    }
    return out;
  }

  // Ordena por Proveedor y devuelve el estado de sort resultante leyendo el src del ícono.
  async clickSortProveedor() {
    const header = this.page.locator('thead th div', { hasText: /Proveedor/ }).first();
    await header.click();
    await this._esperarSinLoading();
    const img = header.locator('img');
    const src = await img.getAttribute('src');
    return src; // contiene sort-asc / sort-desc / sort
  }

  // Devuelve el data-original-title del control/ícono de tarjeta de la fila r.
  // GOTCHA (verificado en el componente): el control de tarjeta VÁLIDA no lleva
  // data-original-title; el número "Tarjeta: {num}" sólo aparece cuando el control
  // es INVALIDA/SIN_COMPROBACION. El ícono de la col Fecha+Hora lleva "Carga
  // realizada con tarjeta de combustible" (sin número). Por eso recorremos TODOS
  // los tooltips de la fila y devolvemos el que refiera a tarjeta (priorizando el
  // que trae número). Devuelve null si la fila no expone ningún tooltip de tarjeta.
  async tooltipTarjetaFila(r) {
    const fila = this.filas.nth(r);
    const titulos = await fila.locator('[data-original-title]').evaluateAll(
      (els) => els.map((e) => e.getAttribute('data-original-title')).filter(Boolean)
    );
    const deTarjeta = titulos.filter((t) => /tarjeta/i.test(t));
    if (deTarjeta.length === 0) return null;
    // Priorizar el que trae número ("Tarjeta: ...").
    const conNumero = deTarjeta.find((t) => /Tarjeta:\s*\S+/i.test(t));
    return conNumero || deTarjeta[0];
  }

  // ── Export ─────────────────────────────────────────────────────────────
  async abrirModalExport() {
    await this.btnAbrirExport.click();
    await this.exportModal.waitFor({ state: 'visible', timeout: 10000 });
    await this.page.waitForTimeout(400);
  }

  async tildarSwitchExport(name) {
    // react-switch: el id va en el <input> oculto; el elemento con role=checkbox
    // es el hermano visible. Patrón fiable: label[for=name] -> div padre -> role=checkbox.
    const target = this.exportModal
      .locator(`label[for="${name}"]`)
      .locator('xpath=..')
      .locator('[role="checkbox"]')
      .first();
    await target.waitFor({ state: 'visible', timeout: 10000 });
    const checked = await target.getAttribute('aria-checked');
    if (checked !== 'true') {
      await target.click();
      await this.page.waitForTimeout(200);
    }
  }

  // Tilda las columnas nuevas (Tarjeta utilizada + 5 controles).
  async tildarColumnasNuevas() {
    for (const name of ['tarjeta', 'controlUbicacion', 'controlTanque', 'controlRendimiento', 'controlTarjeta', 'controlDistancia']) {
      await this.tildarSwitchExport(name);
    }
  }

  async exportarYLeerXlsx() {
    const [download] = await Promise.all([
      this.page.waitForEvent('download', { timeout: 60000 }),
      this.btnExportarExcel.click(),
    ]);
    const path = await download.path();
    const wb = XLSX.readFile(path);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    // headers = primera fila no vacía
    let headerRow = 0;
    while (headerRow < rows.length && rows[headerRow].every((c) => c === '')) headerRow++;
    return {
      filename: download.suggestedFilename(),
      headers: (rows[headerRow] || []).map((h) => String(h).trim()),
      dataRows: rows.slice(headerRow + 1).filter((r) => r.some((c) => c !== '')),
      allRows: rows,
    };
  }
}

module.exports = { CombustiblesGridPage };
