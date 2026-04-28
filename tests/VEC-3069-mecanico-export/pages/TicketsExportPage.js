class TicketsExportPage {
  constructor(page) {
    this.page = page;

    // Dropdown de exportación
    this.btnDropdownExport  = page.locator('button#dropdownMenu2');
    this.btnExportarTickets = page.locator('.dropdown-menu[aria-labelledby="dropdownMenu2"] button').filter({ hasText: 'Exportar Tickets' });

    // Modal
    this.modal = page.locator('#export_modal');

    // Switches (react-switch renderiza un <input hidden> con el id/name)
    this.inputTareaNombre    = page.locator('input#tareaNombre');
    this.inputMecanicoNombres = page.locator('input#mecanicoNombres');

    // Contenedor clickeable del switch (div padre del input oculto)
    this.switchTareaNombre    = page.locator('input#tareaNombre').locator('..');
    this.switchMecanicoNombres = page.locator('input#mecanicoNombres').locator('..');

    // Label del switch Mecánico
    this.labelMecanico = page.locator('label[for="mecanicoNombres"]');

    // Tooltip del switch Mecánico deshabilitado
    this.tooltipMecanico = page.locator('[role="tooltip"]').filter({ hasText: /desglose de tareas/i });
  }

  async gotoTickets() {
    await this.page.goto('/tickets');
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(2000);
  }

  async abrirModalExport() {
    await this.btnDropdownExport.click();
    await this.btnExportarTickets.waitFor({ state: 'visible' });
    await this.btnExportarTickets.click();
    await this.modal.waitFor({ state: 'visible' });
    await this.page.waitForTimeout(500);
  }

  async activarTareaNombre() {
    const checked = await this.inputTareaNombre.isChecked();
    if (!checked) await this.switchTareaNombre.click();
    await this.page.waitForTimeout(300);
  }

  async desactivarTareaNombre() {
    const checked = await this.inputTareaNombre.isChecked();
    if (checked) await this.switchTareaNombre.click();
    await this.page.waitForTimeout(300);
  }

  // Hover sobre el span wrapper del switch deshabilitado para disparar el tooltip
  async hoverSwitchMecanicoDisabled() {
    const spanWrapper = this.page.locator('span[style*="inline-block"]').filter({ has: this.inputMecanicoNombres });
    await spanWrapper.hover();
    await this.page.waitForTimeout(600);
  }
}

module.exports = { TicketsExportPage };
