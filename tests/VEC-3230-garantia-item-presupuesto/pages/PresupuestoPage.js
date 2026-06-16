/**
 * Page Object — Presupuesto Detallado (VEC-3230)
 * Cubre la grilla de repuestos/MO y el modal de garantía.
 */
class PresupuestoPage {
  constructor(page) {
    this.page = page;

    // ── Badge de garantía en la tabla de detalle ─────────────────────────────
    // Aparece en TicketVerPresupuestosDetallado.js dentro de #ver_presupuestos_modal_detallado
    // (fila expandida al clickear el ojo). El modal #presupuesto_detallado_modal tiene
    // TicketVerPresupuestosConRepuestoManoObra con el badge también, pero ese modal
    // está cerrado → los badges ahí son hidden. Por eso scope a #ver_presupuestos_modal_detallado.
    this.badgeGarantia = page.locator('#ver_presupuestos_modal_detallado span.badge-warning').first();
    this.badgesGarantia = page.locator('#ver_presupuestos_modal_detallado span.badge-warning');

    // ── Modal informativo de garantía (al crear correctivo) ──────────────────
    this.modalGarantia = page.locator(
      '#garantia_modal, ' +
      '.modal:has-text("garantía"), ' +
      '.modal:has-text("Garantía"), ' +
      '.modal:has-text("mantenimiento correctivo")'
    ).first();

    this.btnContinuarModal = page.locator(
      '.modal:visible button.btn-primary, ' +
      '.modal:visible button:has-text("Continuar"), ' +
      '.modal:visible button:has-text("Aceptar"), ' +
      '.modal:visible button:has-text("OK")'
    ).first();

    // ── Botón "Presupuesto" en el footer del ticket (abre el historial modal) ─
    this.tabPresupuesto = page.locator(
      'a:has-text("Presupuesto"), ' +
      'button:has-text("Presupuesto"), ' +
      'li:has-text("Presupuesto") a, ' +
      '[data-target*="presupuesto"], ' +
      '[href*="presupuesto"]'
    ).first();

    // ── Botón "Ver" (ojo) en la fila del historial de presupuestos ────────────
    // Este botón expande el detalle de repuestos/MO (TicketVerPresupuestosDetallado.js:1176)
    // Scoped a #ver_presupuestos_modal_detallado para evitar match con otras páginas
    this.btnVerDetalle = page.locator('#ver_presupuestos_modal_detallado button.action.view').first();

    // Tablas en la vista de detalle
    this.tablaRepuestos = page.locator('table').filter({ hasText: /repuesto|ítem|item/i }).first();
    this.tablaMO = page.locator('table').filter({ hasText: /mano de obra|tarea/i }).first();
  }

  /** Navega al detalle editable del ticket. */
  async gotoTicket(ticketId) {
    await this.page.goto(`/tickets/${ticketId}/edit`);
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForSelector('.btn-dt-main.round-icon, .ticket-detail, [ng-controller], [class*="ticket"]', { timeout: 15000 });
  }

  /**
   * Abre el historial de presupuestos (modal) haciendo clic en el botón
   * "Presupuesto" del footer del ticket.
   */
  async abrirPresupuesto() {
    const tab = this.tabPresupuesto;
    const visible = await tab.isVisible({ timeout: 5000 }).catch(() => false);
    if (visible) {
      await tab.click();
      // Esperar que el modal o la sección se cargue
      await this.page.waitForTimeout(1500);
    }
  }

  /**
   * Hace clic en el botón "Ver" (ojo) del primer presupuesto en el historial.
   * Expande la fila de detalle inline con la tabla de ítems/tareas (TicketVerPresupuestosDetallado.js:1176).
   */
  async expandirDetallePresupuesto() {
    await this.page.waitForTimeout(800);

    // Diagnóstico: botones en el modal de historial (ver_presupuestos_modal_detallado)
    const diagnostico = await this.page.evaluate(() => {
      const modal = document.querySelector('#ver_presupuestos_modal_detallado');
      const eyes = modal ? modal.querySelectorAll('i.fa-eye') : document.querySelectorAll('i.fa-eye');
      const info = [];
      for (const eye of eyes) {
        const btn = eye.closest('button');
        const rect = eye.getBoundingClientRect();
        info.push({
          eyeClass: eye.className,
          btnClass: btn ? btn.className : 'sin-btn',
          eyeVisible: rect.width > 0 && rect.height > 0,
          eyeTop: Math.round(rect.top),
          eyeLeft: Math.round(rect.left),
          modalOpen: modal ? modal.classList.contains('show') : null,
        });
      }
      return info;
    });
    console.log('  fa-eye en modal:', JSON.stringify(diagnostico, null, 2));

    // CDP click scoped al modal correcto
    try {
      const eyeBtn = this.page.locator('#ver_presupuestos_modal_detallado button.action.view').first();
      await eyeBtn.scrollIntoViewIfNeeded();
      await eyeBtn.click({ force: true, timeout: 5000 });
      console.log('  ✓ CDP click en #ver_presupuestos_modal_detallado button.action.view');
    } catch (e) {
      console.warn('  ⚠ CDP click falló:', e.message.split('\n')[0]);
      const coords = diagnostico[0];
      if (coords && coords.eyeVisible) {
        await this.page.mouse.click(coords.eyeLeft + 5, coords.eyeTop + 5);
        console.log(`  ✓ Mouse click en (${coords.eyeLeft}, ${coords.eyeTop})`);
      }
    }

    await this.page.waitForTimeout(1500);
  }

  /** Toma screenshot con nombre descriptivo en reports/screenshots/. */
  async screenshot(name) {
    await this.page.screenshot({
      path: `reports/screenshots/VEC-3230-${name}.png`,
      fullPage: true,
    });
  }

  /** Verifica si el badge de garantía aparece para un ticket específico. */
  async badgeParaTicket(ticketId) {
    const selector = `text=Ticket #${ticketId}`;
    return this.page.locator(selector).first();
  }

  /** Espera a que el modal de garantía sea visible. */
  async esperarModalGarantia(timeout = 8000) {
    await this.modalGarantia.waitFor({ state: 'visible', timeout });
  }

  /** Confirma el modal de garantía y continúa. */
  async confirmarModal() {
    await this.btnContinuarModal.click();
    await this.modalGarantia.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
  }
}

module.exports = { PresupuestoPage };
