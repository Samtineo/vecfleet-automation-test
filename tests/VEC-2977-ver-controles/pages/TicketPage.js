class TicketPage {
  constructor(page) {
    this.page = page;
    // Botón Ver Controles (ícono ft-clipboard)
    this.btnVerControles = page.locator('button:has(i.ft.ft-clipboard)');
    // Modal
    this.modal = page.locator('#mantenimientos_movil_modal');
    this.modalTitle = page.locator('#mantenimientos_movil_modal .modal-title');
    this.modalBtnOk = page.locator('#mantenimientos_movil_modal button.btn-default[data-dismiss="modal"]');
    // Tabs dentro del modal
    this.tabPreventivos = page.locator('#mantenimientos_movil_modal a:has-text("Preventivos")');
    this.tabVencimientos = page.locator('#mantenimientos_movil_modal a:has-text("Vencimientos")');
    // Tablas
    this.tablaPreventivos = page.locator('#mantenimientos_movil_modal table').first();
    this.tablaVencimientos = page.locator('#mantenimientos_movil_modal table').last();
    // Mensajes de vacío
    this.msgSinPreventivos = page.locator('#mantenimientos_movil_modal :text("No posee controles de mantenimiento preventivo.")');
    this.msgSinVencimientos = page.locator('#mantenimientos_movil_modal :text("No posee vencimientos.")');
  }

  async gotoTicket(ticketId) {
    await this.page.goto(`/tickets/${ticketId}/edit`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async abrirModal() {
    await this.btnVerControles.click();
    await this.modal.waitFor({ state: 'visible' });
    await this.page.waitForTimeout(1500);
  }

  async cerrarModal() {
    await this.modalBtnOk.click();
    await this.modal.waitFor({ state: 'hidden' });
  }

  async getFilasPreventivos() {
    return this.tablaPreventivos.locator('tbody tr').all();
  }

  async getFilasVencimientos() {
    return this.tablaVencimientos.locator('tbody tr').all();
  }

  async getHeadersPreventivos() {
    const ths = await this.tablaPreventivos.locator('thead th').allTextContents();
    return ths.map(t => t.trim());
  }

  async getHeadersVencimientos() {
    const ths = await this.tablaVencimientos.locator('thead th').allTextContents();
    return ths.map(t => t.trim());
  }
}

module.exports = { TicketPage };
