import { expect, test } from '@playwright/test'

import { E2E_PLUGIN_SLUG, loginAsBuyer } from '../helpers/auth'

test.describe('plugin checkout commerce', () => {
  test('login → plugin detail → cart → checkout confirm', async ({ page }) => {
    await loginAsBuyer(page)

    await page.goto(`/plugins/${E2E_PLUGIN_SLUG}`)
    await expect(page.getByRole('heading', { name: 'E2E Checkout Plugin' })).toBeVisible({
      timeout: 30_000,
    })

    await page.getByRole('button', { name: /Add to Cart/i }).click()
    await expect(page.getByRole('button', { name: /^In cart$/ })).toBeVisible({
      timeout: 15_000,
    })

    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible()
    await expect(page.getByText('E2E Checkout Plugin')).toBeVisible()

    // Every cart line is ticked by default; checkout buys the ticked ones.
    await expect(page.getByRole('checkbox', { name: 'Buy E2E Checkout Plugin' })).toBeChecked()
    await page.getByRole('button', { name: /^Checkout selected \(\d+\)$/ }).click()

    await expect(page).toHaveURL(/\/checkout\/success\?order_id=/, { timeout: 60_000 })
    await expect(page.getByRole('heading', { name: 'Payment successful' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByText(/ready to download/i)).toBeVisible()
  })
})
