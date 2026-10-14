import { expect, test } from '@playwright/test'

import { E2E_PRODUCT_SLUG, loginAsBuyer } from '../helpers/auth'

test.describe('marketplace checkout commerce', () => {
  test('login → viewer → cart → checkout confirm → download', async ({ page }) => {
    await loginAsBuyer(page)

    await page.goto(`/products/${E2E_PRODUCT_SLUG}`)
    await expect(page.getByRole('heading', { name: 'E2E Checkout Chair' })).toBeVisible()

    const viewer = page.getByRole('img', {
      name: /Interactive 3D preview of E2E Checkout Chair/i,
    })
    const viewerLoading = page.getByText(/Loading interactive preview/i)
    await expect(viewer.or(viewerLoading)).toBeVisible({ timeout: 45_000 })
    await expect(viewer).toBeVisible({ timeout: 60_000 })

    await page.getByRole('button', { name: /Add to Cart/i }).click()
    await expect(page.getByRole('button', { name: /^In cart$/ })).toBeVisible({
      timeout: 15_000,
    })

    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible()
    await expect(page.getByText('E2E Checkout Chair')).toBeVisible()

    await page.getByRole('button', { name: /^Checkout$/ }).click()

    await expect(page).toHaveURL(/\/checkout\/success\?order_id=/, { timeout: 60_000 })
    await expect(page.getByRole('heading', { name: 'Payment successful' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByText(/ready to download/i)).toBeVisible()

    await page.getByRole('link', { name: 'Go to my library' }).click()
    await expect(page).toHaveURL(/\/dashboard\/downloads/)
    await expect(page.getByRole('heading', { name: 'My Downloads' })).toBeVisible()
    await expect(page.getByText('E2E Checkout Chair')).toBeVisible()

    const downloadResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/download/') &&
        response.request().method() === 'GET' &&
        response.ok(),
      { timeout: 60_000 },
    )
    // The file must actually download; a missing download event fails the test.
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.getByRole('button', { name: /^Download$/ }).first().click(),
    ])
    await downloadResponse
    expect(download.suggestedFilename()).toMatch(/e2e-checkout-chair/i)

    await page.getByRole('tab', { name: 'Download history' }).click()
    await expect(page.getByText('e2e-checkout-chair.zip')).toBeVisible({ timeout: 15_000 })
  })
})
