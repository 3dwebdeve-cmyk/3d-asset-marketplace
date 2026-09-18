import { expect, test } from '@playwright/test'

import { loginAsAdmin } from '../helpers/auth'

test.describe('admin console SPA', () => {
  test('login → dashboard → hard navigation to products', async ({ page }) => {
    await loginAsAdmin(page)

    await expect(page.getByRole('heading', { name: /admin dashboard/i })).toBeVisible()
    await expect(page.getByRole('navigation').getByRole('link', { name: /dashboard/i })).toBeVisible()

    await page.goto('/console')
    await expect(page).toHaveURL(/\/console\/?$/)
    await expect(page.getByRole('heading', { name: /admin dashboard/i })).toBeVisible({
      timeout: 30_000,
    })

    await page.goto('/console/products')
    await expect(page).toHaveURL(/\/console\/products/)
    await expect(page.getByRole('heading', { name: /^Products$/i })).toBeVisible({
      timeout: 30_000,
    })
  })
})
