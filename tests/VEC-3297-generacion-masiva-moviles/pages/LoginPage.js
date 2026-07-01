class LoginPage {
  constructor(page) {
    this.page = page;
    this.usernameInput = page.locator('input[name="usuario"]');
    this.passwordInput = page.locator('input[name="clave"]');
    this.submitButton = page.locator('button[type="submit"]');
  }

  async login(username, password) {
    await this.page.goto('/');
    await this.usernameInput.waitFor({ state: 'visible', timeout: 15000 });
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await Promise.all([
      // Login OK: React Router redirige y el form desaparece (no usar networkidle,
      // VecFleet hace polling continuo y networkidle nunca resuelve)
      this.usernameInput.waitFor({ state: 'hidden', timeout: 20000 }),
      this.submitButton.click(),
    ]);
  }
}

module.exports = { LoginPage };
