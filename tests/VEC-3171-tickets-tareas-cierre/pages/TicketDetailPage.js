/**
 * Page Object — Detalle de Ticket (VEC-3171)
 * Cubre el flujo de "Listo para Retirar" + "Tareas de Cierre".
 */
class TicketDetailPage {
  constructor(page) {
    this.page = page;

    // ── Botones de acción principales ────────────────────────────────────────
    // Bootstrap tooltip mueve el `title` a `data-original-title`; el `title`
    // propio queda vacío en runtime. El ícono ft-flag identifica "Listo para Retirar".
    this.btnListoParaRetirar = page.locator('div[data-original-title="Listo para Retirar"]');
    this.btnCancelarTicket   = page.locator('div[data-original-title="Cancelar Ticket"]');

    // ── Modal de "Tareas de Cierre" ─────────────────────────────────────────
    // id confirmado inspeccionando el DOM en runtime: "tareas_cierre_modal"
    // Aparece cuando la config "Tareas de Cierre" está habilitada (independiente
    // de Presupuesto Simple/Detallado — es una config separada).
    // Para CA07 (Presupuesto Detallado) este modal NO debe aparecer cuando la
    // instancia también tenga Tareas de Cierre deshabilitado.
    this.modalTareasCierre = page.locator('#tareas_cierre_modal');

    // ── Modal/form del flujo normal de "Listo para Retirar" (Pres. Detallado) ─
    // Muestra campos de costo (fechaRealizado, km, etc.) sin selector de tareas.
    this.modalListoParaRetirar = page.locator('.modal:visible').first();
    this.btnConfirmarModal = page.locator(
      '.modal:visible button.btn-primary, ' +
      '.modal:visible button:has-text("Guardar"), ' +
      '.modal:visible button:has-text("Confirmar"), ' +
      '.modal:visible button:has-text("Aceptar")'
    ).first();
  }

  /** Navega al detalle editable del ticket. */
  async gotoTicket(ticketId) {
    await this.page.goto(`/tickets/${ticketId}/edit`);
    await this.page.waitForLoadState('domcontentloaded');
    // Los botones de acción (round-icon) son renderizados por Angular después del
    // domcontentloaded. Esperamos hasta que alguno esté presente en el DOM.
    await this.page.waitForSelector('.btn-dt-main.round-icon', { timeout: 15000 });
  }

  /** Hace clic en el botón "Listo para Retirar". */
  async clickListoParaRetirar() {
    await this.btnListoParaRetirar.click();
    await this.page.waitForTimeout(1500);
  }

  /**
   * Completa el modal del flujo normal de "Listo para Retirar"
   * (Presupuesto Detallado: sólo campos de costos/fecha, sin selector de tareas).
   * Si no hay modal visible, asume que la acción se ejecutó directamente.
   */
  async confirmarListoParaRetirar() {
    const modalVisible = await this.modalListoParaRetirar
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    if (modalVisible) {
      await this.btnConfirmarModal.click();
      await this.modalListoParaRetirar.waitFor({ state: 'hidden', timeout: 10000 });
    }
  }
}

module.exports = { TicketDetailPage };
