import { expect, test as base, type BrowserContext, type Locator, type Page } from '@playwright/test'

import { loginAsAdmin } from '../helpers/auth'

/**
 * Browser journey through the admin pricing pipeline (docs/PRICING_PIPELINE.md, Part 3) on the
 * scenario seeded by `seed_e2e_pricing` (docs/E2E_LOCAL.md). The steps depend on each other, so
 * the file runs in order and needs a fresh seed: re-run Start-LocalStack.ps1 before a new run.
 */

/**
 * One `test` for the whole file, so Playwright keeps the file order (admin steps, then the shop).
 * Admin steps take `adminPage`: a tab in one signed-in browser context shared by the worker,
 * like an admin who keeps one browser open. Signing in before every step trips the login rate
 * limit (HTTP 429), and a saved storage state cannot be reused: the app rotates the refresh
 * token on every refresh and revokes the old one. Shop and buyer steps use the normal `page`.
 */
const test = base.extend<{ adminPage: Page }, { adminContext: BrowserContext }>({
  adminContext: [
    async ({ browser }, use, workerInfo) => {
      const context = await browser.newContext({ baseURL: workerInfo.project.use.baseURL })
      const signIn = await context.newPage()
      await loginAsAdmin(signIn)
      await signIn.close()
      await use(context)
      await context.close()
    },
    { scope: 'worker' },
  ],
  adminPage: async ({ adminContext, viewport }, use) => {
    const page = await adminContext.newPage()
    if (viewport) await page.setViewportSize(viewport)
    await use(page)
    await page.close()
  },
})
test.describe.configure({ mode: 'serial' })

const PAID_QA = { sku: 'PRC-PAID-QA', name: 'E2E Paid Chair In QA' }
const FREE_QA = { sku: 'PRC-FREE-QA', name: 'E2E Free Lamp In QA' }
const WAIT_LOW = { sku: 'PRC-WAIT-LOW', name: 'E2E Low Poly Stool' }
const WAIT_MID = { sku: 'PRC-WAIT-MID', name: 'E2E Mid Poly Armchair' }
const WAIT_HIGH = { sku: 'PRC-WAIT-HIGH', name: 'E2E High Poly Sofa' }
const WAIT_UNKNOWN = { sku: 'PRC-WAIT-UNKNOWN', name: 'E2E Desk Lamp No Poly Count' }
const LIVE = { sku: 'PRC-LIVE', name: 'E2E Live Dining Chair', slug: 'prc-live' }

/** Console errors and failed page loads, printed per test so a run surfaces them. */
function watchConsole(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  return errors
}

function reportConsole(errors: string[]) {
  if (errors.length === 0) return
  test.info().annotations.push({ type: 'console-errors', description: errors.join('\n') })
  console.log(`[${test.info().title}] console errors:\n  ${errors.join('\n  ')}`)
}

function toast(page: Page, text: RegExp | string): Locator {
  return page.getByRole('region', { name: 'Notifications' }).getByText(text)
}

/** The pricing table row of a model, found by its SKU. */
function pricingRow(page: Page, sku: string): Locator {
  return page
    .locator('table.admin-pricing__table tbody tr')
    .filter({ has: page.getByText(sku, { exact: true }) })
}

/** Type the rate and the five percents into the Model Pricing box: GLB Only = hours x 20. */
async function fillPricingBox(page: Page) {
  await page.getByLabel('Rate per hour (USD)').fill('20')
  await page.getByLabel('With Light Rig percent').fill('60')
  await page.getByLabel('Without Light Rig percent').fill('50')
  await page.getByLabel('With Environment percent').fill('30')
  await page.getByLabel('GLB Only percent').fill('100')
  await page.getByLabel('3ds Max percent').fill('40')
}

async function openPricing(page: Page, tab: 'waiting' | 'live' = 'waiting') {
  await page.goto(tab === 'live' ? '/console/pricing?tab=live' : '/console/pricing')
  await expect(page.getByRole('heading', { name: 'Pricing', level: 1 })).toBeVisible()
  await expect(page.getByRole('tab', { name: tab === 'live' ? /Live models/ : /Waiting for price/ }))
    .toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('table.admin-pricing__table')).toBeVisible()
}

async function searchPricing(page: Page, text: string) {
  await page.getByLabel('Search name or model ID').fill(text)
}

/** Opens a QA queue row's product page from the QA queue. */
async function openFromQaQueue(page: Page, kind: 'Free' | 'Paid', sku: string) {
  await page.goto(`/console/products?status=pending_review&kind=${kind.toLowerCase()}`)
  const row = page.getByRole('row').filter({ hasText: sku })
  await expect(row).toBeVisible()
  await row.getByRole('link', { name: /Manage/ }).click()
  await expect(page).toHaveURL(/\/console\/products\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: 'Import QA' })).toBeVisible()
}

test.describe('admin pricing pipeline', () => {
  test('1. QA queue has Free and Paid sections with counts and labels', async ({ adminPage: page }) => {
    const errors = watchConsole(page)

    await page.goto('/console/products?status=pending_review')
    const sections = page.getByRole('tablist', { name: 'QA sections' })
    const freeTab = sections.getByRole('tab', { name: /Free models/ })
    const paidTab = sections.getByRole('tab', { name: /Paid models/ })

    // Free is the default section. Each tab shows a count (at least the seeded model).
    await expect(freeTab).toHaveAttribute('aria-selected', 'true')
    await expect(freeTab).toHaveText(/Free models\s*[1-9]\d*/)
    await expect(paidTab).toHaveText(/Paid models\s*[1-9]\d*/)
    await expect(page.getByText('Approving a free model publishes it as a free download.')).toBeVisible()

    const freeRow = page.getByRole('row').filter({ hasText: FREE_QA.sku })
    await expect(freeRow).toBeVisible()
    await expect(freeRow.locator('.admin-kind-badge')).toHaveText('Free')
    await expect(page.getByRole('row').filter({ hasText: PAID_QA.sku })).toHaveCount(0)

    await paidTab.click()
    await expect(page).toHaveURL(/kind=paid/)
    await expect(paidTab).toHaveAttribute('aria-selected', 'true')
    const paidRow = page.getByRole('row').filter({ hasText: PAID_QA.sku })
    await expect(paidRow).toBeVisible()
    await expect(paidRow.locator('.admin-kind-badge')).toHaveText('Paid')
    await expect(page.getByRole('row').filter({ hasText: FREE_QA.sku })).toHaveCount(0)
    await expect(page.getByText(/sends it to the Pricing page/)).toBeVisible()

    reportConsole(errors)
  })

  test('2. QA approve: paid goes to Waiting for price, free is published', async ({ adminPage: page }) => {
    const errors = watchConsole(page)

    // Paid model: label, no sheet price (prices are set per package), approve -> Waiting for price.
    await openFromQaQueue(page, 'Paid', PAID_QA.sku)
    const qa = page.locator('.admin-create-form').filter({ has: page.getByRole('heading', { name: 'Import QA' }) })
    await expect(qa.getByText('Paid', { exact: true })).toBeVisible()
    await expect(qa.getByText(/Suggested price/)).toHaveCount(0)
    await qa.getByRole('button', { name: 'Approve quality → send to Pricing' }).click()
    await expect(toast(page, 'Approved. The model now waits on the Pricing page.')).toBeVisible()
    await expect(qa.getByText(/Waiting for price\. Set a price for each package on the/)).toBeVisible()
    await expect(qa.getByRole('link', { name: 'Pricing page' })).toHaveAttribute('href', '/console/pricing')
    await expect(qa.getByRole('button', { name: /Approve quality/ })).toHaveCount(0)

    // Free model: "Publish as free", no suggested price.
    await openFromQaQueue(page, 'Free', FREE_QA.sku)
    const freeQa = page.locator('.admin-create-form').filter({ has: page.getByRole('heading', { name: 'Import QA' }) })
    await expect(freeQa.getByText('Free', { exact: true })).toBeVisible()
    await expect(freeQa.getByText(/Suggested price/)).toHaveCount(0)
    await freeQa.getByRole('button', { name: 'Publish as free' }).click()
    await expect(toast(page, 'Published as a free download')).toBeVisible()
    // Once published the QA block goes away.
    await expect(page.getByRole('heading', { name: 'Import QA' })).toHaveCount(0)

    // Both left the QA queue.
    await page.goto('/console/products?status=pending_review&kind=paid')
    await expect(page.getByRole('tab', { name: /Paid models/ })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: PAID_QA.sku })).toHaveCount(0)
    await page.goto('/console/products?status=pending_review&kind=free')
    await expect(page.getByRole('tab', { name: /Free models/ })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: FREE_QA.sku })).toHaveCount(0)

    reportConsole(errors)
  })

  test('3. Pricing page: Waiting tab lists waiting models and the filters work', async ({ adminPage: page }) => {
    const errors = watchConsole(page)
    await openPricing(page)

    const waitingTab = page.getByRole('tab', { name: /Waiting for price/ })
    await expect(waitingTab).toHaveText(/Waiting for price\s*[1-9]\d*/)
    await expect(page.getByRole('tab', { name: /Live models/ })).toHaveText(/Live models\s*[1-9]\d*/)

    for (const model of [PAID_QA, WAIT_LOW, WAIT_MID, WAIT_HIGH, WAIT_UNKNOWN]) {
      await expect(pricingRow(page, model.sku)).toBeVisible()
    }
    // Free and live models are not in the Waiting tab.
    await expect(pricingRow(page, FREE_QA.sku)).toHaveCount(0)
    await expect(pricingRow(page, LIVE.sku)).toHaveCount(0)

    // Row details: the hours (typed, empty for the High Poly Sofa), the GLB Only variation's
    // price (or "Not set"), the "From" price.
    const paidRow = pricingRow(page, PAID_QA.sku)
    await expect(paidRow.getByLabel(`Hours for ${PAID_QA.name}`)).toHaveValue('8.00')
    await expect(paidRow).toContainText('$25.00')
    await expect(pricingRow(page, WAIT_LOW.sku)).toContainText('Not set')
    await expect(pricingRow(page, WAIT_HIGH.sku).getByLabel(`Hours for ${WAIT_HIGH.name}`)).toHaveValue('')

    // Category (main category includes its subcategories), then subcategory.
    const subcategory = page.getByLabel('Subcategory')
    await expect(subcategory).toBeDisabled()
    await page.getByLabel('Category', { exact: true }).selectOption({ label: 'E2E Lighting' })
    await expect(pricingRow(page, WAIT_UNKNOWN.sku)).toBeVisible()
    await expect(pricingRow(page, WAIT_MID.sku)).toHaveCount(0)
    await page.getByLabel('Category', { exact: true }).selectOption({ label: 'E2E Furniture' })
    await expect(pricingRow(page, WAIT_MID.sku)).toBeVisible()
    await expect(pricingRow(page, WAIT_UNKNOWN.sku)).toHaveCount(0)
    await expect(subcategory).toBeEnabled()
    await subcategory.selectOption({ label: 'E2E Chairs' })
    await expect(pricingRow(page, WAIT_LOW.sku)).toBeVisible()
    await expect(pricingRow(page, WAIT_UNKNOWN.sku)).toHaveCount(0)
    await page.getByLabel('Category', { exact: true }).selectOption('')
    await expect(subcategory).toBeDisabled()

    // Search by model ID.
    await searchPricing(page, WAIT_HIGH.sku)
    await expect(pricingRow(page, WAIT_HIGH.sku)).toBeVisible()
    await expect(pricingRow(page, WAIT_LOW.sku)).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Pricing pagination' })).toContainText('1 models')
    await searchPricing(page, '')
    await expect(pricingRow(page, WAIT_LOW.sku)).toBeVisible()

    // Upload batch.
    await page.getByLabel('Upload batch').selectOption('e2e-pricing-batch-2')
    await expect(pricingRow(page, WAIT_MID.sku)).toBeVisible()
    await expect(pricingRow(page, WAIT_LOW.sku)).toHaveCount(0)
    await expect(pricingRow(page, PAID_QA.sku)).toHaveCount(0)
    await page.getByLabel('Upload batch').selectOption('e2e-pricing-batch-1')
    await expect(pricingRow(page, WAIT_LOW.sku)).toBeVisible()
    await expect(pricingRow(page, WAIT_MID.sku)).toHaveCount(0)
    await page.getByLabel('Upload batch').selectOption('')
    await expect(pricingRow(page, WAIT_MID.sku)).toBeVisible()

    reportConsole(errors)
  })

  test('4. Model Pricing box: calculate beside each variation, publish; a model without hours stays', async ({ adminPage: page }) => {
    const errors = watchConsole(page)
    await openPricing(page)

    const selection = page.locator('.admin-pricing__selection')
    for (const model of [PAID_QA, WAIT_LOW, WAIT_MID, WAIT_HIGH]) {
      await page.getByRole('checkbox', { name: `Select ${model.name}` }).check()
    }
    await expect(selection).toContainText('4 selected')

    // Nothing to publish before a calculation.
    await expect(page.getByRole('button', { name: 'Publish selected (4)' })).toBeDisabled()
    await fillPricingBox(page)
    await page.getByRole('button', { name: 'Calculate prices (4)' }).click()

    // The new price shows right beside the model's variation (hours 8 / 4 / 6, rate $20, GLB Only 100%).
    await expect(pricingRow(page, PAID_QA.sku)).toContainText('GLB Only: $25.00 → $160.00')
    await expect(pricingRow(page, WAIT_LOW.sku)).toContainText('GLB Only: Not set → $80.00')
    await expect(pricingRow(page, WAIT_MID.sku)).toContainText('GLB Only: $30.00 → $120.00')
    // The model without hours says why and gets no price.
    await expect(pricingRow(page, WAIT_HIGH.sku)).toContainText('Enter the hours spent first.')
    await expect(page.locator('.admin-pricing__calc-summary')).toContainText('3 of 4 models priced')

    // Changing a box clears the calculation.
    await page.getByLabel('GLB Only percent').fill('90')
    await expect(pricingRow(page, PAID_QA.sku)).not.toContainText('→')
    await expect(page.getByRole('button', { name: 'Publish selected (4)' })).toBeDisabled()
    await page.getByLabel('GLB Only percent').fill('100')
    await page.getByRole('button', { name: 'Calculate prices (4)' }).click()
    await expect(pricingRow(page, PAID_QA.sku)).toContainText('→ $160.00')

    // Publish: summary first, then the results.
    await page.getByRole('button', { name: 'Publish selected (4)' }).click()
    const summary = page.getByRole('dialog', { name: 'Publish 4 models?' })
    await expect(summary).toContainText('1 cannot be priced and will stay waiting')
    await summary.getByRole('button', { name: 'Publish 4 models' }).click()
    const results = page.getByRole('region', { name: /published, .* not published/ })
    await expect(results.getByRole('heading')).toHaveText('3 published, 1 not published')
    await expect(toast(page, '3 models published.')).toBeVisible()
    await expect(results.getByRole('listitem').filter({ hasText: WAIT_HIGH.name })).toContainText('hours')

    // The unpriced model stays waiting; the published ones are on the Live tab at their prices.
    await expect(pricingRow(page, WAIT_HIGH.sku)).toBeVisible()
    await expect(pricingRow(page, PAID_QA.sku)).toHaveCount(0)
    await page.getByRole('tab', { name: /Live models/ }).click()
    await searchPricing(page, 'PRC-')
    await expect(pricingRow(page, PAID_QA.sku)).toContainText('$160.00')
    await expect(pricingRow(page, WAIT_LOW.sku)).toContainText('$80.00')
    await expect(pricingRow(page, WAIT_MID.sku)).toContainText('$120.00')

    reportConsole(errors)
  })

  test('6a. The publish summary opens where the admin can see it (changes no data)', async ({ adminPage: page }) => {
    await openPricing(page)
    await page.getByRole('checkbox', { name: `Select ${WAIT_UNKNOWN.name}` }).check()
    await fillPricingBox(page)
    await page.getByRole('button', { name: 'Calculate prices (1)' }).click()
    await page.getByRole('button', { name: 'Publish selected (1)' }).click()
    const summary = page.getByRole('dialog', { name: 'Publish 1 model?' })
    await expect(summary).toBeInViewport()
    await summary.getByRole('button', { name: 'Cancel' }).click()
  })
})

test.describe('pricing pages at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  async function expectNoHorizontalScroll(page: Page) {
    // A string expression: the e2e tsconfig has no DOM types.
    const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth')
    expect(overflow, 'page is wider than the screen').toBeLessThanOrEqual(1)
  }

  test('Pricing page fits a 390px screen', async ({ adminPage: page }) => {
    await openPricing(page, 'live')
    await expect(page.getByRole('heading', { name: 'Pricing', exact: true })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('pricing-390.png'), fullPage: true })
    // The table is wider than the phone; its wrapper scrolls sideways to the price columns.
    const tableWrap = page.locator('.admin-pricing__layout .admin-table-wrap').first()
    await expect(tableWrap).toHaveCSS('overflow-x', 'auto')
    await page.getByRole('columnheader', { name: 'From', exact: true }).scrollIntoViewIfNeeded()
    await expect(page.getByRole('columnheader', { name: 'From', exact: true })).toBeInViewport()
    await expectNoHorizontalScroll(page)
  })

  test('Product page fits a 390px screen', async ({ adminPage: page }) => {
    await page.goto(`/products/${LIVE.slug}`)
    await expect(page.getByRole('heading', { name: LIVE.name })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('product-390.png'), fullPage: true })
    await expectNoHorizontalScroll(page)
  })
})
