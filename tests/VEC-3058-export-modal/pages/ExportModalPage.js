// Page Object para el modal de exportación de Móviles y Tickets (VEC-3058).
// Ambos módulos comparten el mismo #export_modal con las mismas opciones.
class ExportModalPage {
  constructor(page) {
    this.page = page;

    // Modal
    this.modal           = page.locator('#export_modal');
    this.btnExportarExcel = page.locator('#export_modal .modal-footer button.btn-fleet');
    this.btnCancelar      = page.locator('#export_modal .modal-footer button.btn-danger');

    // "Mantener Selección" — label[for=persisteSeleccionExport] → parent → checkbox
    this.switchMantener = page
      .locator('#export_modal label[for="persisteSeleccionExport"]')
      .locator('xpath=..')
      .locator('[role="checkbox"]');

    // "Marcar / Desmarcar todo" — label[for=marcarDesmarcarTodo] → parent → checkbox
    this.switchToggleAll = page
      .locator('#export_modal label[for="marcarDesmarcarTodo"]')
      .locator('xpath=..')
      .locator('[role="checkbox"]');
  }

  // ── Navegación y apertura ──────────────────────────────────────────────

  async gotoMoviles() {
    await this.page.goto('/moviles');
    await this.page.waitForLoadState('domcontentloaded');
    // Botón directo (sin dropdown) que abre el modal de exportación
    await this.page.locator('button.btn-secondary.buttons-collection').first()
      .waitFor({ state: 'visible', timeout: 15000 });
  }

  async abrirModalMoviles() {
    await this.page.locator('button.btn-secondary.buttons-collection').first().click();
    await this.modal.waitFor({ state: 'visible', timeout: 10000 });
    await this.page.waitForTimeout(500);
  }

  async gotoTickets() {
    await this.page.goto('/tickets');
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.locator('button#dropdownMenu2').waitFor({ state: 'visible', timeout: 15000 });
  }

  async abrirModalTickets() {
    await this.page.locator('button#dropdownMenu2').click();
    const btnExportar = this.page.locator('.dropdown-menu[aria-labelledby="dropdownMenu2"] button')
      .filter({ hasText: 'Exportar Tickets' });
    await btnExportar.waitFor({ state: 'visible' });
    await btnExportar.click();
    await this.modal.waitFor({ state: 'visible', timeout: 10000 });
    await this.page.waitForTimeout(500);
  }

  async cerrarModal() {
    await this.btnCancelar.click();
    await this.modal.waitFor({ state: 'hidden', timeout: 5000 });
    await this.page.waitForTimeout(300);
  }

  // ── Estado de switches ─────────────────────────────────────────────────

  async isMantenerActivo() {
    return (await this.switchMantener.getAttribute('aria-checked')) === 'true';
  }

  async isToggleAllActivo() {
    return (await this.switchToggleAll.getAttribute('aria-checked')) === 'true';
  }

  async activarMantener() {
    if (!(await this.isMantenerActivo())) {
      await this.switchMantener.click();
      await this.page.waitForTimeout(300);
    }
  }

  async desactivarMantener() {
    if (await this.isMantenerActivo()) {
      await this.switchMantener.click();
      await this.page.waitForTimeout(300);
    }
  }

  // Marca todas las columnas (si ya están todas marcadas, desmarca y vuelve a marcar)
  async marcarTodo() {
    if (await this.isToggleAllActivo()) {
      await this.switchToggleAll.click();
      await this.page.waitForTimeout(300);
    }
    await this.switchToggleAll.click();
    await this.page.waitForTimeout(300);
  }

  // Desmarca todas las columnas
  async desmarcarTodo() {
    if (!(await this.isToggleAllActivo())) {
      await this.switchToggleAll.click();
      await this.page.waitForTimeout(300);
    }
    await this.switchToggleAll.click();
    await this.page.waitForTimeout(300);
  }

  // Devuelve los ids de todos los switches de columna visibles en el modal
  async getVisibleColumnIds() {
    return this.page.evaluate(() => {
      var modal = document.querySelector('#export_modal');
      if (!modal) return [];
      return Array.from(modal.querySelectorAll('[role="checkbox"]'))
        .filter(el => {
          var r = el.getBoundingClientRect();
          // Excluir los switches de control (Mantener Selección y Marcar/Desmarcar todo)
          var lbl = el.closest('div') && el.closest('div').querySelector('label');
          if (!lbl) return false;
          var forAttr = lbl.getAttribute('for');
          return forAttr && forAttr !== 'persisteSeleccionExport' && forAttr !== 'marcarDesmarcarTodo';
        })
        .map(el => {
          var lbl = el.closest('div').querySelector('label');
          return lbl ? lbl.getAttribute('for') : null;
        })
        .filter(Boolean);
    });
  }

  // Devuelve el estado del localStorage de exportación para el módulo dado
  async getStorage(storageKey) {
    return this.page.evaluate((key) => {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, storageKey);
  }

  async clearStorage(storageKey) {
    await this.page.evaluate((key) => localStorage.removeItem(key), storageKey);
  }
}

module.exports = { ExportModalPage };
