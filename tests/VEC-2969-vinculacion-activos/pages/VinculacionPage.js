// Page Object para la sección de vinculación de activos en el módulo Vehículos (VEC-2969).
class VinculacionPage {
  constructor(page) {
    this.page = page;

    // Sección "Relaciones" en la ficha del vehículo
    this.headerRelaciones = page.locator('h4.form-section i.la.la-link').locator('..');
    this.listaAsociados   = page.locator('ul.list-unstyled');
    this.btnHistorico     = page.locator('button[data-target="#relaciones_historico_modal"]');

    // Modal de histórico
    this.modalHistorico  = page.locator('#relaciones_historico_modal');
    this.tablaHistorico  = page.locator('table[aria-label="historico relaciones"]');
    this.btnCerrarModal  = page.locator('#relaciones_historico_modal .modal-footer button');

    // Duallistbox (modo EDIT)
    this.duallistbox     = page.locator('.bootstrap-duallistbox-container');
    this.leftBoxSelect   = page.locator('.bootstrap-duallistbox-container .box1 select');
    this.rightBoxSelect  = page.locator('.bootstrap-duallistbox-container .box2 select');
    this.btnMoveOne      = page.locator('.bootstrap-duallistbox-container button.move').first();
    this.btnRemoveOne    = page.locator('.bootstrap-duallistbox-container button.remove').first();

    // Botón guardar del formulario
    this.btnGuardar      = page.locator('button[type="submit"]').first();
  }

  // ── Navegación ────────────────────────────────────────────────────────────

  async gotoDetalle(movilId) {
    await this.page.goto(`/moviles/${movilId}`);
    await this.page.waitForLoadState('domcontentloaded');
    await this.headerRelaciones.waitFor({ state: 'visible', timeout: 20000 });
  }

  async gotoEdit(movilId) {
    await this.page.goto(`/moviles/${movilId}/edit`);
    await this.page.waitForLoadState('domcontentloaded');
    await this.duallistbox.waitFor({ state: 'visible', timeout: 20000 });
  }

  // ── Histórico ─────────────────────────────────────────────────────────────

  async abrirHistorico() {
    await this.btnHistorico.click();
    await this.modalHistorico.waitFor({ state: 'visible', timeout: 10000 });
    await this.tablaHistorico.waitFor({ state: 'visible', timeout: 10000 });
    await this.page.waitForTimeout(500);
  }

  async cerrarHistorico() {
    await this.btnCerrarModal.click();
    await this.modalHistorico.waitFor({ state: 'hidden', timeout: 5000 });
  }

  // Devuelve los textos de todas las filas del historial
  async getFilasHistorico() {
    const rows = this.tablaHistorico.locator('tbody tr');
    return rows.allTextContents();
  }

  // Devuelve los encabezados de la tabla de historial
  async getColumnasHistorico() {
    const ths = this.tablaHistorico.locator('thead th');
    return ths.allTextContents();
  }

  // ── Duallistbox (edit) ────────────────────────────────────────────────────

  // Mueve un activo de "disponibles" a "seleccionados"
  async vincularActivo(asociadoId) {
    await this.leftBoxSelect.selectOption(String(asociadoId));
    await this.btnMoveOne.click();
    await this.page.waitForTimeout(400);
  }

  // Mueve un activo de "seleccionados" a "disponibles"
  async desvincularActivo(asociadoId) {
    await this.rightBoxSelect.selectOption(String(asociadoId));
    await this.btnRemoveOne.click();
    await this.page.waitForTimeout(400);
  }

  // Devuelve los valores disponibles en el box izquierdo
  async getDisponibles() {
    return this.leftBoxSelect.locator('option').allTextContents();
  }

  // Devuelve los valores seleccionados en el box derecho
  async getSeleccionados() {
    return this.rightBoxSelect.locator('option').allTextContents();
  }

  // ── Guardar ───────────────────────────────────────────────────────────────

  async guardar() {
    await this.btnGuardar.click();
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(1000);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  // Devuelve true si el texto del activo asociado aparece en la lista de activos activos
  async tieneAsociadoActivo(texto) {
    const items = await this.listaAsociados.allTextContents();
    return items.some(t => t.includes(texto));
  }
}

module.exports = { VinculacionPage };
