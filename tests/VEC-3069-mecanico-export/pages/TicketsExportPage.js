class TicketsExportPage {
  constructor(page) {
    this.page = page;

    // Dropdown de exportación en el grid
    this.btnDropdownExport  = page.locator('button#dropdownMenu2');
    this.btnExportarTickets = page.locator('.dropdown-menu[aria-labelledby="dropdownMenu2"] button')
                                  .filter({ hasText: 'Exportar Tickets' });

    // Modal
    this.modal       = page.locator('#export_modal');
    this.modalBody   = page.locator('#export_modal .modal-body');
    this.seccionColumnas = page.locator('#export_modal').getByText('Columnas a exportar');

    // Botón "Exportar a Excel" dentro del footer del modal
    this.btnExportarExcel = page.locator('#export_modal .modal-footer button.btn-fleet');

    // Switch "Marcar / Desmarcar todo" — sin id, se localiza por su label
    this.switchToggleAll = page.locator('#export_modal label[for="marcarDesmarcarTodo"]')
                               .locator('xpath=..').locator('[role="checkbox"]');
  }

  async gotoTickets() {
    await this.page.goto('/tickets');
    await this.page.waitForLoadState('domcontentloaded');
    await this.btnDropdownExport.waitFor({ state: 'visible', timeout: 15000 });
  }

  async abrirModalExport() {
    await this.btnDropdownExport.click();
    await this.btnExportarTickets.waitFor({ state: 'visible' });
    await this.btnExportarTickets.click();
    await this.modal.waitFor({ state: 'visible' });
    await this.page.waitForTimeout(500);
  }

  // Deja todas las columnas deseleccionadas
  async desmarcarTodo() {
    const ariaChecked = await this.switchToggleAll.getAttribute('aria-checked');
    if (ariaChecked !== 'true') {
      await this.switchToggleAll.click(); // Marcar todo primero
      await this.page.waitForTimeout(300);
    }
    await this.switchToggleAll.click(); // Desmarcar todo
    await this.page.waitForTimeout(300);
  }

  // Activa o desactiva un switch de columna por su id
  async setSwitchState(switchId, targetState) {
    const input   = this.page.locator(`input#${switchId}`);
    const checked = await input.isChecked();
    if (checked !== targetState) {
      const switchEl = this.page.locator('[role="checkbox"]')
                                .filter({ has: this.page.locator(`input#${switchId}`) });
      await switchEl.click();
      await this.page.waitForTimeout(200);
    }
  }

  // Inicia el export e intercepta el archivo descargado
  async exportarYDescargar() {
    const downloadPromise = this.page.waitForEvent('download');
    await this.btnExportarExcel.click();
    return await downloadPromise;
  }
}

module.exports = { TicketsExportPage };
