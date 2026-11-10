import { expect, test as base, type BrowserContext, type Locator, type Page } from '@playwright/test'

import { loginAsAdmin, loginAsBuyer } from '../helpers/auth'

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
const LIVE_ENDED = { sku: 'PRC-LIVE-ENDED', name: 'E2E Live Floor Lamp Sale Ended', slug: 'prc-live-ended' }

// Calculator "By poly level" prices used in step 4 (Unknown is left empty on purpose).
const TIER = { low: '9.00', mid: '19.99', high: '49.00' }
// PRC-PAID-QA (mid) + PRC-WAIT-LOW (low) + PRC-WAIT-MID (mid); PRC-WAIT-HIGH has no price.
const PUBLISH_TOTAL = '$48.98'

// Sale end used in step 6 and checked in step 7: a fixed, far-future local time. Playwright loads
// this file again for later steps, so a value computed from "now" can move a minute between them.
const SALE_END_LOCAL = '2099-06-15T18:30'

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

function previewSection(page: Page): Locator {
  return page.getByRole('region', { name: 'Preview' })
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

    // Paid model: label, suggested price, approve -> Waiting for price.
    await openFromQaQueue(page, 'Paid', PAID_QA.sku)
    const qa = page.locator('.admin-create-form').filter({ has: page.getByRole('heading', { name: 'Import QA' }) })
    await expect(qa.getByText('Paid', { exact: true })).toBeVisible()
    await expect(qa.getByText(/Suggested price \(from the upload sheet\): USD 25(\.00)?/)).toBeVisible()
    await qa.getByRole('button', { name: 'Approve quality → send to Pricing' }).click()
    await expect(toast(page, 'Approved. The model now waits on the Pricing page.')).toBeVisible()
    await expect(qa.getByText(/Waiting for price\. Set the price on the/)).toBeVisible()
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

    // Row details: poly level, price "Not set", buyer pays.
    const paidRow = pricingRow(page, PAID_QA.sku)
    await expect(paidRow).toContainText('Mid poly')
    await expect(paidRow).toContainText('$25.00')
    await expect(pricingRow(page, WAIT_LOW.sku)).toContainText('Not set')
    await expect(pricingRow(page, WAIT_UNKNOWN.sku)).toContainText('Unknown')

    // Poly level.
    await page.getByLabel('Poly level', { exact: true }).selectOption('high')
    await expect(pricingRow(page, WAIT_HIGH.sku)).toBeVisible()
    await expect(pricingRow(page, WAIT_MID.sku)).toHaveCount(0)
    await expect(pricingRow(page, WAIT_LOW.sku)).toHaveCount(0)
    await page.getByLabel('Poly level', { exact: true }).selectOption('mid')
    await expect(pricingRow(page, WAIT_MID.sku)).toBeVisible()
    await expect(pricingRow(page, PAID_QA.sku)).toBeVisible()
    await expect(pricingRow(page, WAIT_HIGH.sku)).toHaveCount(0)
    await page.getByLabel('Poly level', { exact: true }).selectOption('')

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

  test('4. Calculator by poly level: preview, a note for the unpriced level, save', async ({ adminPage: page }) => {
    const errors = watchConsole(page)
    await openPricing(page)

    const selection = page.locator('.admin-pricing__selection')
    for (const model of [PAID_QA, WAIT_LOW, WAIT_MID, WAIT_UNKNOWN]) {
      await page.getByRole('checkbox', { name: `Select ${model.name}` }).check()
    }
    await expect(selection).toContainText('4 selected')

    await page.getByRole('radio', { name: 'Set the price' }).check()
    await page.getByRole('radio', { name: 'By poly level' }).check()
    await page.getByLabel('Low poly (USD)').fill(TIER.low)
    await page.getByLabel('Mid poly (USD)').fill(TIER.mid)
    await page.getByLabel('High poly (USD)').fill(TIER.high)
    await page.getByRole('button', { name: 'Calculate preview (4)' }).click()

    const preview = previewSection(page)
    await expect(preview).toBeVisible()
    const previewRow = (sku: string) => preview.getByRole('row').filter({ hasText: sku })
    await expect(previewRow(PAID_QA.sku)).toContainText(`$25.00 → $${TIER.mid}`)
    await expect(previewRow(WAIT_LOW.sku)).toContainText(`$0.00 → $${TIER.low}`)
    await expect(previewRow(WAIT_MID.sku)).toContainText(`$30.00 → $${TIER.mid}`)
    // The model whose level got no price has a note and blocks the save.
    const unknownNote = previewRow(WAIT_UNKNOWN.sku).locator('td').last()
    await expect(unknownNote).not.toHaveText(/^(Changes|No change)$/)
    await expect(unknownNote).not.toBeEmpty()
    await expect(preview).toContainText('1 cannot take this price')
    await expect(preview.getByText(/Remove the models with a note from the selection/)).toBeVisible()
    await expect(preview.getByRole('button', { name: 'Save prices' })).toBeDisabled()

    // Deselecting clears the preview; recalculate without the Unknown model.
    await page.getByRole('checkbox', { name: `Select ${WAIT_UNKNOWN.name}` }).uncheck()
    await expect(preview).toBeHidden()
    await page.getByRole('button', { name: 'Calculate preview (3)' }).click()
    await expect(preview).toBeVisible()
    await expect(preview).toContainText('3 models, 3 will change')
    await expect(preview).toContainText(`Buyers pay $55.00 → ${PUBLISH_TOTAL} in total`)
    await expect(preview.getByRole('row').filter({ hasText: WAIT_UNKNOWN.sku })).toHaveCount(0)
    const save = preview.getByRole('button', { name: 'Save prices' })
    await expect(save).toBeEnabled()
    await save.click()

    await expect(toast(page, 'Saved: 3 model prices changed.')).toBeVisible()
    await expect(preview).toBeHidden()
    await expect(pricingRow(page, PAID_QA.sku)).toContainText(`$${TIER.mid}`)
    await expect(pricingRow(page, WAIT_LOW.sku)).toContainText(`$${TIER.low}`)
    await expect(pricingRow(page, WAIT_MID.sku)).toContainText(`$${TIER.mid}`)
    await expect(pricingRow(page, WAIT_UNKNOWN.sku)).toContainText('$15.00')
    // Saving does not publish: the models are still waiting and still selected.
    await expect(pricingRow(page, WAIT_LOW.sku)).toBeVisible()
    await expect(selection).toContainText('3 selected')

    reportConsole(errors)
  })

  // Fixed: the publish summary used the rows as they were when ticked, so right after "Save
  // prices" it added up the old prices and counted newly priced models as "no price yet".
  test('5a. Publish summary right after saving uses the saved prices', async ({ adminPage: page }) => {
    await openPricing(page)
    await page.getByRole('checkbox', { name: `Select ${WAIT_UNKNOWN.name}` }).check()
    await page.getByRole('radio', { name: 'Set the price' }).check()
    await page.getByRole('radio', { name: 'One price for all' }).check()
    await page.getByLabel('Price (USD)').fill('12.00')
    await page.getByRole('button', { name: 'Calculate preview (1)' }).click()
    await previewSection(page).getByRole('button', { name: 'Save prices' }).click()
    await expect(toast(page, 'Saved: 1 model price changed.')).toBeVisible()
    await expect(pricingRow(page, WAIT_UNKNOWN.sku)).toContainText('$12.00')

    await page.getByRole('button', { name: 'Publish selected (1)' }).click()
    const summary = page.getByRole('dialog', { name: 'Publish 1 model?' })
    await expect(summary).toContainText('total $12.00') // shows $15.00 today
    await summary.getByRole('button', { name: 'Cancel' }).click()
  })

  test('5. Publish selected: summary, confirm, results; the unpriced model stays waiting', async ({ adminPage: page }) => {
    const errors = watchConsole(page)
    // A fresh page, so the summary reads the saved prices (see 5a).
    await openPricing(page)

    const selection = page.locator('.admin-pricing__selection')
    for (const model of [PAID_QA, WAIT_LOW, WAIT_MID, WAIT_HIGH]) {
      await page.getByRole('checkbox', { name: `Select ${model.name}` }).check()
    }
    await expect(selection).toContainText('4 selected')
    await page.getByRole('button', { name: 'Publish selected (4)' }).click()

    const summary = page.getByRole('dialog', { name: 'Publish 4 models?' })
    await expect(summary).toBeVisible()
    await expect(summary).toContainText(`total ${PUBLISH_TOTAL}`)
    await expect(summary).toContainText(/1 (has|have) no price yet and will stay waiting/)
    await summary.getByRole('button', { name: 'Publish 4 models' }).click()

    const results = page.getByRole('region', { name: /published, .* not published/ })
    await expect(results.getByRole('heading')).toHaveText('3 published, 1 not published')
    await expect(toast(page, '3 models published.')).toBeVisible()
    await expect(summary).toBeHidden()
    const reason = results.getByRole('listitem').filter({ hasText: WAIT_HIGH.name })
    await expect(reason).toBeVisible()
    await expect(reason).toContainText(/price/i)

    // The unpriced model stays waiting (and selected); the published ones leave the tab.
    await expect(pricingRow(page, WAIT_HIGH.sku)).toBeVisible()
    await expect(pricingRow(page, WAIT_HIGH.sku)).toContainText('Not set')
    await expect(pricingRow(page, PAID_QA.sku)).toHaveCount(0)
    await expect(pricingRow(page, WAIT_LOW.sku)).toHaveCount(0)
    await expect(pricingRow(page, WAIT_MID.sku)).toHaveCount(0)
    await expect(selection).toContainText('1 selected')

    // The published models are on the Live tab now.
    await page.getByRole('tab', { name: /Live models/ }).click()
    await searchPricing(page, 'PRC-')
    await expect(pricingRow(page, PAID_QA.sku)).toContainText(`$${TIER.mid}`)
    await expect(pricingRow(page, WAIT_LOW.sku)).toContainText(`$${TIER.low}`)

    reportConsole(errors)
  })

  test('6. Live tab: a big sale needs typed confirmation; a 20% sale with an end is saved', async ({ adminPage: page }) => {
    const errors = watchConsole(page)
    await openPricing(page, 'live')

    await searchPricing(page, LIVE.sku)
    const liveRow = pricingRow(page, LIVE.sku)
    await expect(liveRow).toBeVisible()
    await expect(page.getByRole('button', { name: /Publish selected/ })).toHaveCount(0)
    await page.getByRole('checkbox', { name: `Select ${LIVE.name}` }).check()

    await page.getByRole('radio', { name: 'Give a sale' }).check()
    await page.getByRole('radio', { name: 'Percentage off' }).check()
    await page.getByLabel('Percent off (up to 90)').fill('60')
    await page.getByRole('button', { name: 'Calculate preview (1)' }).click()

    const preview = previewSection(page)
    await expect(preview).toBeVisible()
    await expect(preview.getByRole('row').filter({ hasText: LIVE.sku })).toContainText('$16.00')
    const confirm = preview.getByLabel('This sale takes more than 50% off. Type 1 to confirm.')
    const save = preview.getByRole('button', { name: 'Save prices' })
    await expect(confirm).toBeVisible()
    await expect(save).toBeDisabled()
    await confirm.fill('2')
    await expect(save).toBeDisabled()
    await confirm.fill('1')
    await expect(save).toBeEnabled()

    // Changing the rule clears the preview; 20% off does not need confirmation.
    await page.getByLabel('Percent off (up to 90)').fill('20')
    await expect(preview).toBeHidden()
    await page.getByLabel('Sale ends (your local time, optional)').fill(SALE_END_LOCAL)
    await page.getByRole('button', { name: 'Calculate preview (1)' }).click()
    await expect(preview).toBeVisible()
    const row = preview.getByRole('row').filter({ hasText: LIVE.sku })
    await expect(row).toContainText('$32.00')
    await expect(row).toContainText('$8.00 (20')
    await expect(row).toContainText(/until /)
    await expect(preview.getByLabel(/Type 1 to confirm/)).toHaveCount(0)
    await expect(save).toBeEnabled()
    await save.click()

    await expect(toast(page, 'Saved: 1 model price changed.')).toBeVisible()
    await expect(liveRow).toContainText('$32.00')
    await expect(liveRow).toContainText(/until /)
    await expect(liveRow.locator('td').last()).toHaveText('$32.00')

    reportConsole(errors)
  })

  // Fixed: "Calculate preview" and "Publish selected" render their panel at the bottom of the page
  // (AdminPricingPage.tsx:606, 656), below the table and the calculator. At 1280x720 with only a
  // handful of rows the panel already starts below the fold (preview top ~867px, summary ~795px),
  // so the click looks like it did nothing. Expected: the panel scrolls into view (or is a modal
  // with focus moved to it). This test only previews and cancels; it changes no data.
  test('6a. The preview and the publish summary open where the admin can see them', async ({ adminPage: page }) => {
    await openPricing(page, 'live')
    await searchPricing(page, LIVE.sku)
    await page.getByRole('checkbox', { name: `Select ${LIVE.name}` }).check()
    await page.getByRole('radio', { name: 'Give a sale' }).check()
    await page.getByLabel('Percent off (up to 90)').fill('10')
    await page.getByRole('button', { name: 'Calculate preview (1)' }).click()
    await expect(previewSection(page)).toBeInViewport()

    await openPricing(page)
    await page.getByRole('checkbox', { name: `Select ${WAIT_HIGH.name}` }).check()
    await page.getByRole('button', { name: 'Publish selected (1)' }).click()
    const summary = page.getByRole('dialog', { name: 'Publish 1 model?' })
    await expect(summary).toBeInViewport()
    await summary.getByRole('button', { name: 'Cancel' }).click()
  })

})

test.describe('shop and buyer after pricing', () => {
  test('7. Shop: the sale shows on the card and the product page; an ended sale does not', async ({ page }) => {
    const errors = watchConsole(page)

    await page.goto('/3d-models?search=E2E%20Live')
    const card = page.locator('article.product-card').filter({ has: page.getByRole('link', { name: LIVE.name, exact: true }) })
    await expect(card).toBeVisible()
    await expect(card).toContainText('-20%')
    await expect(card).toContainText('$ 32.00')
    await expect(card).toContainText('$ 40.00')

    const endedCard = page.locator('article.product-card').filter({ has: page.getByRole('link', { name: LIVE_ENDED.name, exact: true }) })
    await expect(endedCard).toBeVisible()
    await expect(endedCard).toContainText('$ 60.00')
    // (Its name contains "Sale Ended", so check the badge and prices rather than the word.)
    await expect(endedCard.locator('.product-card__badge-discount')).toHaveCount(0)
    await expect(endedCard.locator('.product-card__price--original')).toHaveCount(0)
    await expect(endedCard).not.toContainText('%')
    await expect(endedCard).not.toContainText('45.00')

    await page.goto(`/products/${LIVE.slug}`)
    await expect(page.getByRole('heading', { name: LIVE.name })).toBeVisible()
    const purchase = page.getByRole('complementary', { name: 'Product purchase details' })
    const price = purchase.locator('.product-detail-purchase__price')
    await expect(price.locator('.product-detail-purchase__price-current')).toHaveText('$32.00')
    const original = price.locator('.product-detail-purchase__price-original')
    await expect(original).toHaveText('$40.00')
    await expect(original).toHaveCSS('text-decoration-line', 'line-through')
    await expect(price).toContainText('-20%')
    const expectedEnd = await page.evaluate(
      (local) => new Date(local).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
      SALE_END_LOCAL,
    )
    await expect(purchase.getByText(`Sale ends ${expectedEnd}`)).toBeVisible()

    await page.goto(`/products/${LIVE_ENDED.slug}`)
    await expect(page.getByRole('heading', { name: LIVE_ENDED.name })).toBeVisible()
    const endedPurchase = page.getByRole('complementary', { name: 'Product purchase details' })
    await expect(endedPurchase.locator('.product-detail-purchase__price-current')).toHaveText('$60.00')
    await expect(endedPurchase.locator('.product-detail-purchase__price-original')).toHaveCount(0)
    await expect(endedPurchase.getByText(/Sale ends/)).toHaveCount(0)
    await expect(endedPurchase).not.toContainText('$45.00')

    reportConsole(errors)
  })

  test('8. Buyer: the cart charges the sale price', async ({ page }) => {
    const errors = watchConsole(page)
    await loginAsBuyer(page)

    // The buyer's cart survives a re-seed: start from a cart without this model.
    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible()
    const clear = page.getByRole('button', { name: 'Clear cart' })
    if (await clear.isVisible()) {
      await clear.click()
      await expect(page.getByText(/Your cart is empty/)).toBeVisible()
    }

    await page.goto(`/products/${LIVE.slug}`)
    await expect(page.getByRole('heading', { name: LIVE.name })).toBeVisible()
    const purchase = page.getByRole('complementary', { name: 'Product purchase details' })
    await purchase.getByRole('button', { name: /Add to Cart/i }).click()
    await expect(purchase.getByRole('button', { name: /^In cart$/i })).toBeVisible({ timeout: 15_000 })

    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible()
    const line = page.locator('.cart-page__line').filter({ hasText: LIVE.name })
    await expect(line).toBeVisible()
    await expect(line.locator('.cart-line-item__price')).toHaveText('$32.00')
    await expect(page.getByRole('checkbox', { name: `Buy ${LIVE.name}` })).toBeChecked()
    await expect(page.locator('.cart-summary--total')).toContainText('$32.00')
    // Stops before paying: checkout-flow.spec.ts covers the simulated payment.

    reportConsole(errors)
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
    await expect(page.getByRole('heading', { name: 'Calculator' })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('pricing-390.png'), fullPage: true })
    // The table is wider than the phone; its wrapper scrolls sideways to the price columns.
    const tableWrap = page.locator('.admin-pricing__layout .admin-table-wrap').first()
    await expect(tableWrap).toHaveCSS('overflow-x', 'auto')
    await page.getByRole('columnheader', { name: 'Buyer pays' }).scrollIntoViewIfNeeded()
    await expect(page.getByRole('columnheader', { name: 'Buyer pays' })).toBeInViewport()
    await expectNoHorizontalScroll(page)
  })

  test('Product page with a sale fits a 390px screen', async ({ adminPage: page }) => {
    await page.goto(`/products/${LIVE.slug}`)
    await expect(page.getByRole('heading', { name: LIVE.name })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('product-390.png'), fullPage: true })
    await expectNoHorizontalScroll(page)
  })
})
