import { expect, type Locator, type Page } from '@playwright/test'

export const E2E_BUYER_EMAIL = process.env.E2E_BUYER_EMAIL ?? 'e2e-buyer@example.com'
export const E2E_BUYER_PASSWORD = process.env.E2E_BUYER_PASSWORD ?? 'E2eBuyerPass123!'
export const E2E_PRODUCT_SLUG = process.env.E2E_PRODUCT_SLUG ?? 'e2e-checkout-chair'

export const E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'e2e-admin@example.com'
export const E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'E2eAdminPass123!'

export const E2E_PLUGIN_SLUG = process.env.E2E_PLUGIN_SLUG ?? 'e2e-checkout-plugin'

export const E2E_UNVERIFIED_EMAIL =
  process.env.E2E_UNVERIFIED_EMAIL ?? 'e2e-unverified@example.com'
export const E2E_UNVERIFIED_PASSWORD =
  process.env.E2E_UNVERIFIED_PASSWORD ?? 'E2eUnverifiedPass123!'

async function openCustomerLoginDialog(page: Page): Promise<Locator> {
  await page.goto('/')
  await page.getByRole('button', { name: /^(Login|Sign in)$/ }).first().click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

/**
 * Scope to the dialog and target the form submit control. A bare /sign in/i
 * name match is unsafe here because AuthModeTabs also exposes "Sign In".
 */
async function submitCustomerLogin(page: Page, dialog: Locator) {
  const submitButton = dialog.locator('form.auth-form button[type="submit"]')

  await expect(submitButton).toBeVisible()
  await expect(submitButton).toBeEnabled()
  await expect(submitButton).toHaveAccessibleName(/sign in/i)

  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/auth/login/') &&
      response.request().method() === 'POST',
  )

  await submitButton.click()
  return loginResponsePromise
}

export async function loginAsBuyer(page: Page): Promise<void> {
  const dialog = await openCustomerLoginDialog(page)

  await dialog.locator('#auth-email').fill(E2E_BUYER_EMAIL)
  await dialog.locator('#auth-password').fill(E2E_BUYER_PASSWORD)

  const loginResponse = await submitCustomerLogin(page, dialog)

  if (!loginResponse.ok()) {
    throw new Error(`Buyer login failed with HTTP ${loginResponse.status()}.`)
  }

  // Modal login returns users to the page where they opened it. Since this
  // helper starts at "/", a successful login intentionally stays at "/".
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: /^Hi, E2E$/i })).toBeVisible()
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/console/login')
  await expect(page.getByRole('heading', { name: /admin sign in/i })).toBeVisible()

  await page.locator('#admin-email').fill(E2E_ADMIN_EMAIL)
  await page.locator('#admin-password').fill(E2E_ADMIN_PASSWORD)

  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/auth/admin/login/') &&
      response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: /^Sign in$/i }).click()
  const loginResponse = await loginResponsePromise

  if (!loginResponse.ok()) {
    throw new Error(`Admin login failed with HTTP ${loginResponse.status()}.`)
  }

  await expect(page).toHaveURL(/\/console\/?$/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: /admin dashboard/i })).toBeVisible({
    timeout: 30_000,
  })
}

export async function attemptUnverifiedLogin(page: Page): Promise<void> {
  const dialog = await openCustomerLoginDialog(page)

  await dialog.locator('#auth-email').fill(E2E_UNVERIFIED_EMAIL)
  await dialog.locator('#auth-password').fill(E2E_UNVERIFIED_PASSWORD)

  const loginResponse = await submitCustomerLogin(page, dialog)

  expect(loginResponse.status()).toBe(403)
}
