import { expect, test } from '@playwright/test'

import { attemptUnverifiedLogin } from '../helpers/auth'

test.describe('unverified customer login gate', () => {
  test('unverified credentials stay in auth modal with resend link', async ({ page }) => {
    await attemptUnverifiedLogin(page)

    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(
      page.getByText(/please verify your email address before signing in/i),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /resend verification email/i }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /^Hi,/i })).toHaveCount(0)
  })
})
