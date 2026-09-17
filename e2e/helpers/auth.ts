import { expect, type Page } from '@playwright/test'

export const E2E_BUYER_EMAIL = process.env.E2E_BUYER_EMAIL ?? 'e2e-buyer@example.com'
export const E2E_BUYER_PASSWORD = process.env.E2E_BUYER_PASSWORD ?? 'E2eBuyerPass123!'
export const E2E_PRODUCT_SLUG = process.env.E2E_PRODUCT_SLUG ?? 'e2e-checkout-chair'

export async function loginAsBuyer(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: /^(Login|Sign in)$/ }).first().click()
  await page.locator('#auth-email').fill(E2E_BUYER_EMAIL)
  await page.locator('#auth-password').fill(E2E_BUYER_PASSWORD)

  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/auth/login/') &&
      response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: /Sign in to 3D Hub/i }).click()
  const loginResponse = await loginResponsePromise

  if (!loginResponse.ok()) {
    throw new Error(`Buyer login failed with HTTP ${loginResponse.status()}.`)
  }

  // Modal login returns users to the page where they opened it. Since this
  // helper starts at "/", a successful login intentionally stays at "/".
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByRole('button', { name: /^Hi, E2E$/i })).toBeVisible()
}
