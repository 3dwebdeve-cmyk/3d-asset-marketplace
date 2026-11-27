import { expect, test } from '@playwright/test'

import { E2E_BUYER_EMAIL, E2E_PRODUCT_SLUG, loginAsBuyer } from '../helpers/auth'

test.describe('marketplace checkout commerce', () => {
  test('login → viewer → cart → checkout confirm → download', async ({ page }, testInfo) => {
    // A failed attempt can leave a purchase or cart behind on the server.
    const [buyer, domain] = E2E_BUYER_EMAIL.trim().toLowerCase().split('@')
    await loginAsBuyer(page, `${buyer}+checkout-${testInfo.retry}@${domain}`)

    await page.goto(`/products/${E2E_PRODUCT_SLUG}`)
    await expect(page.getByRole('heading', { name: 'E2E Checkout Chair' })).toBeVisible()

    const viewer = page.getByRole('group', {
      name: /Interactive 3D preview of E2E Checkout Chair/i,
    })
    const viewerLoading = page.getByText(/Loading interactive preview/i)
    await expect(viewer.or(viewerLoading)).toBeVisible({ timeout: 45_000 })
    await expect(viewer).toBeVisible({ timeout: 60_000 })

    // Open the purchase dialog before selecting a package.
    await page.getByRole('button', { name: 'Choose packages', exact: true }).click()
    const purchaseDialog = page.getByRole('dialog', { name: 'Product packages' })
    await expect(purchaseDialog).toBeVisible()
    const packages = purchaseDialog.getByRole('region', { name: 'Choose your packages' })
    await packages.getByRole('checkbox', { name: 'GLB Only' }).check()
    await packages.getByRole('button', { name: 'Add selected to cart' }).click()
    await expect(packages.getByRole('link', { name: 'In cart' })).toBeVisible({
      timeout: 15_000,
    })

    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible()
    await expect(page.getByText('E2E Checkout Chair')).toBeVisible()

    // Every cart line is ticked by default; checkout buys the ticked ones. The line names
    // the package.
    await expect(page.getByRole('checkbox', { name: 'Buy E2E Checkout Chair - GLB Only' })).toBeChecked()
    // Payment confirmation starts the download automatically.
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.getByRole('button', { name: /^Checkout selected \(\d+\)$/ }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/e2e-checkout-chair/i)
    expect(await download.failure()).toBeNull()

    await expect(page).toHaveURL(/\/checkout\/success\?order_id=/, { timeout: 60_000 })
    await expect(page.getByRole('heading', { name: 'Payment successful' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByText(/ready to download/i)).toBeVisible()

    await page.getByRole('link', { name: 'Go to my library' }).click()
    await expect(page).toHaveURL(/\/dashboard\/downloads/)
    await expect(page.getByRole('heading', { name: 'My Downloads' })).toBeVisible()
    await expect(page.getByText('E2E Checkout Chair')).toBeVisible()

    await page.getByRole('tab', { name: 'Download history' }).click()
    await expect(
      page.getByRole('cell', { name: 'e2e-checkout-chair.zip (GLB Only)', exact: true }),
    ).toHaveCount(1, { timeout: 15_000 })
  })
})
