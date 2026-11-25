import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { listAdminCategories } from '../../api/categoriesApi'
import {
  calculatePricing,
  listPricingBatches,
  listPricingModels,
  publishPricing,
  savePricingHours,
} from '../../api/pricingApi'
import { AdminIcon } from '../../components/admin/AdminIcon'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { getApiErrorMessage } from '../../lib/apiError'
import { PACKAGE_LABELS, PRICED_KINDS, type PricedKind } from '../../lib/packages'
import { toast } from '../../lib/toast'
import { MAX_MODELS_PER_ACTION } from '../../types/pricing'
import type {
  PricingCalcRow,
  PricingCalculation,
  PricingInputBody,
  PricingPackage,
  PricingPublishResult,
  PricingRow,
  PricingTab,
} from '../../types/pricing'
import '../../styles/admin-pricing.css'

const PAGE_SIZE = 50
const NUMBER_PATTERN = /^\d+(\.\d{1,2})?$/
const MAX_RATE = 100_000
const MAX_PERCENT = 200

type Percents = Record<PricedKind, string>
const EMPTY_PERCENTS: Percents = {
  with_light_rig: '',
  without_light_rig: '',
  glb_only: '',
  environment: '',
}

function money(value: string | null | undefined): string {
  return value === null || value === undefined ? '—' : `$${value}`
}

function when(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Scrolls a panel that just opened into view and moves keyboard focus to it. */
function revealPanel(panel: HTMLElement | null) {
  if (!panel) return
  // Optional calls: jsdom (unit tests) has no scrollIntoView.
  panel.scrollIntoView?.({ block: 'start' })
  panel.focus?.({ preventScroll: true })
}

function isPositive(value: string, max: number): boolean {
  const text = value.trim()
  return NUMBER_PATTERN.test(text) && Number(text) > 0 && Number(text) <= max
}

/** A model's packages. After a calculation each variation shows its new price beside it;
 * a model that cannot be priced shows why instead. */
function PackagePrices({
  packages,
  calculated,
}: {
  packages: PricingPackage[]
  calculated?: PricingCalcRow
}) {
  if (packages.length === 0) return <em>No packages</em>
  const newPrices = new Map((calculated?.packages ?? []).map((item) => [item.kind, item.price]))
  return (
    <>
      <ul className="admin-pricing__packages">
        {packages.map((row) => (
          <li key={row.kind}>
            <span>{row.label}:</span>{' '}
            {row.price === null ? (
              <em>Not set</em>
            ) : row.sale_price ? (
              <>
                {money(row.sale_price)} <s>{money(row.price)}</s>
                {row.sale_ends_at ? <span className="home-page__subtitle"> until {when(row.sale_ends_at)}</span> : null}
              </>
            ) : (
              money(row.price)
            )}
            {newPrices.has(row.kind) ? (
              <strong className="admin-pricing__new-price"> → {money(newPrices.get(row.kind))}</strong>
            ) : null}
          </li>
        ))}
      </ul>
      {calculated?.error ? <p className="admin-pricing__row-error" role="alert">{calculated.error}</p> : null}
    </>
  )
}

export function AdminPricingPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: PricingTab = searchParams.get('tab') === 'live' ? 'live' : 'waiting'

  // Filters
  const [categoryId, setCategoryId] = useState('')
  const [subcategoryId, setSubcategoryId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput.trim(), 300)
  const [batch, setBatch] = useState('')
  const [ordering, setOrdering] = useState('name')
  const [page, setPage] = useState(1)

  // Selection survives paging; at most MAX_MODELS_PER_ACTION models.
  const [selected, setSelected] = useState<Map<string, PricingRow>>(() => new Map())

  // The Model Pricing box: one rate and one percent per package, for every ticked model.
  const [rate, setRate] = useState('')
  const [percents, setPercents] = useState<Percents>(EMPTY_PERCENTS)
  // Hours typed in the table and not saved yet (saved when the box loses focus).
  const [hoursDraft, setHoursDraft] = useState<Record<string, string>>({})

  const [calculation, setCalculation] = useState<{ body: PricingInputBody; result: PricingCalculation } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [showPublishSummary, setShowPublishSummary] = useState(false)
  const [publishResult, setPublishResult] = useState<PricingPublishResult | null>(null)
  // The publish summary and the results open below the table: bring each into view and
  // move focus to it, or the click looks like it did nothing.
  const publishSummaryRef = useRef<HTMLElement>(null)
  const publishResultRef = useRef<HTMLElement>(null)
  useEffect(() => { if (showPublishSummary) revealPanel(publishSummaryRef.current) }, [showPublishSummary])
  useEffect(() => { if (publishResult) revealPanel(publishResultRef.current) }, [publishResult])

  const listParams = {
    tab,
    category_id: categoryId || undefined,
    subcategory_id: subcategoryId || undefined,
    search: search || undefined,
    import_batch_id: batch || undefined,
    ordering,
    page,
    page_size: PAGE_SIZE,
  }

  const modelsQuery = useQuery({
    queryKey: ['admin', 'pricing', 'list', listParams],
    queryFn: () => listPricingModels(listParams),
  })
  const waitingCount = useQuery({
    queryKey: ['admin', 'pricing', 'count', 'waiting'],
    queryFn: () => listPricingModels({ tab: 'waiting', page_size: 1 }),
  })
  const liveCount = useQuery({
    queryKey: ['admin', 'pricing', 'count', 'live'],
    queryFn: () => listPricingModels({ tab: 'live', page_size: 1 }),
  })
  const batchesQuery = useQuery({
    queryKey: ['admin', 'pricing', 'batches', tab],
    queryFn: () => listPricingBatches(tab),
  })
  const categoriesQuery = useQuery({
    queryKey: ['admin', 'categories', 'pricing'],
    queryFn: () => listAdminCategories({ is_active: true, page_size: 100 }),
  })
  const categories = categoriesQuery.data?.results ?? []
  const mainCategories = categories.filter((category) => !category.parent)
  const subcategories = categories.filter((category) => category.parent?.id === categoryId)

  const rows = modelsQuery.data?.results ?? []
  const selectedRows = useMemo(() => [...selected.values()], [selected])
  const selectedIds = selectedRows.map((row) => row.id)
  const calculatedById = useMemo(
    () => new Map((calculation?.result.rows ?? []).map((row) => [row.id, row])),
    [calculation],
  )

  // Any change to the selection, the boxes or the hours makes the calculation stale.
  const resetCalculation = () => {
    setCalculation(null)
    setShowPublishSummary(false)
    setFormError(null)
  }
  const resetPage = () => setPage(1)

  const switchTab = (next: PricingTab) => {
    const params = new URLSearchParams(searchParams)
    params.set('tab', next)
    setSearchParams(params)
    setSelected(new Map())
    setHoursDraft({})
    setBatch('')
    setPage(1)
    setPublishResult(null)
    resetCalculation()
  }

  const toggle = (row: PricingRow) => {
    resetCalculation()
    if (!selected.has(row.id) && selected.size >= MAX_MODELS_PER_ACTION) {
      setFormError(`Select at most ${MAX_MODELS_PER_ACTION} models at a time.`)
      return
    }
    setSelected((current) => {
      const next = new Map(current)
      if (next.has(row.id)) {
        next.delete(row.id)
      } else {
        next.set(row.id, row)
      }
      return next
    })
  }

  const allOnPageSelected = rows.length > 0 && rows.every((row) => selected.has(row.id))
  const togglePage = () => {
    resetCalculation()
    setSelected((current) => {
      const next = new Map(current)
      if (allOnPageSelected) {
        rows.forEach((row) => next.delete(row.id))
      } else {
        for (const row of rows) {
          if (next.size >= MAX_MODELS_PER_ACTION) break
          next.set(row.id, row)
        }
      }
      return next
    })
  }

  const refreshLists = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'pricing'] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
  }

  // ─── Hours ────────────────────────────────────────────────────────────────
  const hoursOf = (row: PricingRow) => hoursDraft[row.id] ?? row.hours_spent ?? ''

  const hoursMutation = useMutation({
    mutationFn: (item: { id: string; hours: string }) =>
      savePricingHours([{ id: item.id, hours_spent: item.hours.trim() || null }]),
    onSuccess: async (_result, item) => {
      setHoursDraft((current) => {
        const next = { ...current }
        delete next[item.id]
        return next
      })
      resetCalculation()
      await refreshLists()
    },
    onError: (error) => setFormError(getApiErrorMessage(error, 'Could not save the hours.')),
  })

  const saveHours = (row: PricingRow) => {
    const typed = hoursDraft[row.id]
    if (typed === undefined || typed.trim() === (row.hours_spent ?? '')) {
      setHoursDraft((current) => {
        const next = { ...current }
        delete next[row.id]
        return next
      })
      return
    }
    if (typed.trim() !== '' && !isPositive(typed, 99_999)) {
      setFormError('Hours must be a number above 0.')
      return
    }
    setFormError(null)
    hoursMutation.mutate({ id: row.id, hours: typed })
  }

  // ─── Calculate and publish ────────────────────────────────────────────────
  const buildBody = (): PricingInputBody | string => {
    if (selectedIds.length === 0) return 'Tick at least one model.'
    if (Object.keys(hoursDraft).length > 0) return 'Finish typing the hours first (click outside the box to save).'
    if (!isPositive(rate, MAX_RATE)) return 'Enter the rate per hour, for example 20 or 12.50.'
    for (const kind of PRICED_KINDS) {
      if (!isPositive(percents[kind], MAX_PERCENT)) {
        return `Enter the ${PACKAGE_LABELS[kind]} percent (above 0, at most ${MAX_PERCENT}).`
      }
    }
    return {
      product_ids: selectedIds,
      rate: rate.trim(),
      percents: Object.fromEntries(PRICED_KINDS.map((kind) => [kind, percents[kind].trim()])) as Percents,
    }
  }

  const calculateMutation = useMutation({
    mutationFn: (body: PricingInputBody) => calculatePricing(body).then((result) => ({ body, result })),
    onSuccess: (data) => setCalculation(data),
    onError: (error) => setFormError(getApiErrorMessage(error, 'Could not calculate the prices.')),
  })

  const onCalculate = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    setPublishResult(null)
    const body = buildBody()
    if (typeof body === 'string') {
      setFormError(body)
      return
    }
    calculateMutation.mutate(body)
  }

  const publishMutation = useMutation({
    mutationFn: () => {
      if (!calculation) throw new Error('No calculation')
      return publishPricing({
        ...calculation.body,
        preview_token: calculation.result.preview_token,
        confirm_count: calculation.body.product_ids.length,
      })
    },
    onSuccess: async (result) => {
      setPublishResult(result)
      setShowPublishSummary(false)
      setCalculation(null)
      setSelected((current) => {
        const next = new Map(current)
        result.results.filter((row) => row.published).forEach((row) => next.delete(row.id))
        return next
      })
      toast.success(`${result.published} model${result.published === 1 ? '' : 's'} published.`)
      await refreshLists()
    },
    onError: (error) => {
      if (isAxiosError(error) && error.response?.status === 409) {
        setCalculation(null)
        setShowPublishSummary(false)
        setFormError('Prices or hours changed since the calculation. Calculate again.')
        return
      }
      setFormError(getApiErrorMessage(error, 'Could not publish the models.'))
    },
  })

  const summary = calculation?.result.summary
  const busy = calculateMutation.isPending || publishMutation.isPending || hoursMutation.isPending
  const canPublish = tab === 'waiting' && calculation !== null && (summary?.priced ?? 0) > 0

  return (
    <main className="dashboard-page admin-pricing-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="admin-pricing-title">
        <header className="products-heading">
          <span className="products-heading__icon"><AdminIcon name="tag" size={32} /></span>
          <div>
            <h1 id="admin-pricing-title">Pricing</h1>
            <p className="home-page__subtitle">
              Tick the models, type the rate and the percents, calculate, then publish. Each model is
              priced only for the variations it has.
            </p>
          </div>
        </header>

        <div className="admin-pricing__tabs" role="tablist" aria-label="Pricing tabs">
          {(
            [
              ['waiting', 'Waiting for price', waitingCount.data?.count],
              ['live', 'Live models', liveCount.data?.count],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={`admin-pricing__tab${tab === value ? ' admin-pricing__tab--active' : ''}`}
              onClick={() => switchTab(value)}
            >
              {label} <span className="products-count">{count ?? '—'}</span>
            </button>
          ))}
        </div>

        <div className="admin-pricing__filters" aria-label="Filters">
          <FormField id="pricing-category" label="Category">
            <select
              id="pricing-category"
              className="ui-input"
              value={categoryId}
              onChange={(event) => { setCategoryId(event.target.value); setSubcategoryId(''); resetPage() }}
            >
              <option value="">All categories</option>
              {mainCategories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </FormField>
          <FormField id="pricing-subcategory" label="Subcategory">
            <select
              id="pricing-subcategory"
              className="ui-input"
              value={subcategoryId}
              disabled={!categoryId || subcategories.length === 0}
              onChange={(event) => { setSubcategoryId(event.target.value); resetPage() }}
            >
              <option value="">All subcategories</option>
              {subcategories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </FormField>
          <FormField id="pricing-search" label="Search name or model ID">
            <Input
              id="pricing-search"
              value={searchInput}
              onChange={(event) => { setSearchInput(event.target.value); resetPage() }}
            />
          </FormField>
          <FormField id="pricing-batch" label="Upload batch">
            <select
              id="pricing-batch"
              className="ui-input"
              value={batch}
              onChange={(event) => { setBatch(event.target.value); resetPage() }}
            >
              <option value="">All batches</option>
              {(batchesQuery.data ?? []).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </FormField>
          <FormField id="pricing-order" label="Sort">
            <select id="pricing-order" className="ui-input" value={ordering} onChange={(event) => setOrdering(event.target.value)}>
              <option value="name">Name A–Z</option>
              <option value="-created_at">Newest first</option>
              <option value="price">Price low–high</option>
              <option value="-price">Price high–low</option>
              <option value="hours_spent">Hours low–high</option>
              <option value="-hours_spent">Hours high–low</option>
              <option value="polygon_count">Polygons low–high</option>
              <option value="-polygon_count">Polygons high–low</option>
            </select>
          </FormField>
        </div>

        <div className={`admin-pricing__layout${tab === 'waiting' ? ' admin-pricing__layout--with-panel' : ''}`}>
          {tab === 'waiting' ? (
            <aside className="admin-pricing__panel" aria-labelledby="pricing-box-title">
              <h2 id="pricing-box-title">Model Pricing</h2>
              <form onSubmit={onCalculate} noValidate>
                <div className="admin-pricing__formula">
                  <label htmlFor="pricing-rate">Base price = Hours ×</label>
                  <Input
                    id="pricing-rate"
                    inputMode="decimal"
                    aria-label="Rate per hour (USD)"
                    placeholder="$ / hour"
                    value={rate}
                    onChange={(event) => { setRate(event.target.value); resetCalculation() }}
                  />
                </div>
                {PRICED_KINDS.map((kind) => (
                  <div className="admin-pricing__formula" key={kind}>
                    <label htmlFor={`pricing-percent-${kind}`}>{PACKAGE_LABELS[kind]} = Base price ×</label>
                    <span className="admin-pricing__percent">
                      <Input
                        id={`pricing-percent-${kind}`}
                        inputMode="decimal"
                        aria-label={`${PACKAGE_LABELS[kind]} percent`}
                        value={percents[kind]}
                        onChange={(event) => {
                          setPercents((current) => ({ ...current, [kind]: event.target.value }))
                          resetCalculation()
                        }}
                      />
                      <span aria-hidden="true">%</span>
                    </span>
                  </div>
                ))}
                {formError ? <Alert variant="error" message={formError} /> : null}
                <Button type="submit" variant="secondary" isLoading={calculateMutation.isPending} disabled={busy || selected.size === 0}>
                  Calculate prices ({selected.size})
                </Button>
              </form>
            </aside>
          ) : null}

          <div className="admin-table-wrap">
            {tab === 'live' && formError ? <Alert variant="error" message={formError} /> : null}
            <div className="admin-pricing__selection">
              <strong>{selected.size} selected</strong>
              <span className="home-page__subtitle"> (at most {MAX_MODELS_PER_ACTION})</span>
              {selected.size > 0 ? (
                <Button type="button" variant="secondary" onClick={() => { setSelected(new Map()); resetCalculation() }}>
                  Clear selection
                </Button>
              ) : null}
              {tab === 'waiting' ? (
                <Button
                  type="button"
                  disabled={!canPublish || busy}
                  onClick={() => { setPublishResult(null); setShowPublishSummary(true) }}
                >
                  Publish selected ({selected.size})
                </Button>
              ) : null}
            </div>
            {summary ? (
              <p role="status" className="admin-pricing__calc-summary">
                {summary.priced} of {summary.models} model{summary.models === 1 ? '' : 's'} priced
                {summary.errors > 0 ? `, ${summary.errors} cannot be priced (see the note on the model)` : ''}.
                Check the new prices, then publish.
              </p>
            ) : null}

            {modelsQuery.isLoading ? <Spinner label="Loading models..." /> : modelsQuery.isError ? (
              <ErrorState
                title="Could not load models"
                description="The pricing list could not be loaded."
                action={<Button variant="secondary" onClick={() => modelsQuery.refetch()}>Retry</Button>}
              />
            ) : (
              <table className="admin-table admin-pricing__table">
                <thead>
                  <tr>
                    <th scope="col">
                      <input
                        type="checkbox"
                        aria-label="Select all models on this page"
                        checked={allOnPageSelected}
                        onChange={togglePage}
                      />
                    </th>
                    <th scope="col">Model</th>
                    <th scope="col">Category</th>
                    <th scope="col">Polygons</th>
                    <th scope="col">Hours</th>
                    <th scope="col">Variations and prices</th>
                    <th scope="col">From</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className={selected.has(row.id) ? 'admin-pricing__row--selected' : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.name}`}
                          checked={selected.has(row.id)}
                          onChange={() => toggle(row)}
                        />
                      </td>
                      <td>
                        <Link to={`/console/products/${row.id}`}>{row.name}</Link>
                        <div className="home-page__subtitle">{row.sku ?? '—'}</div>
                        {row.pending_update ? <span className="admin-live-update-badge">Update in QA</span> : null}
                      </td>
                      <td>{row.category.name}</td>
                      <td>{row.polygon_count?.toLocaleString() ?? '—'}</td>
                      <td>
                        {tab === 'waiting' ? (
                          <Input
                            aria-label={`Hours for ${row.name}`}
                            inputMode="decimal"
                            className="admin-pricing__number"
                            value={hoursOf(row)}
                            onChange={(event) => setHoursDraft((current) => ({ ...current, [row.id]: event.target.value }))}
                            onBlur={() => saveHours(row)}
                          />
                        ) : (
                          row.hours_spent ?? '—'
                        )}
                      </td>
                      <td>
                        <PackagePrices
                          packages={row.packages}
                          calculated={calculatedById.get(row.id)}
                        />
                      </td>
                      <td>{Number(row.price) > 0 ? money(row.buyer_pays) : <em>Not set</em>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {rows.length === 0 && !modelsQuery.isLoading && !modelsQuery.isError ? (
              <p className="home-page__subtitle">
                {tab === 'waiting'
                  ? 'No models are waiting for a price. Paid models arrive here after QA approval.'
                  : 'No paid models on the store match these filters.'}
              </p>
            ) : null}
            <nav className="plugins-pagination" aria-label="Pricing pagination">
              <span>{modelsQuery.data?.count ?? 0} models</span>
              <div>
                <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>&lsaquo;</button>
                <span className="plugins-pagination__current" aria-current="page">{page}</span>
                <button type="button" aria-label="Next page" disabled={!modelsQuery.data?.next} onClick={() => setPage(page + 1)}>&rsaquo;</button>
              </div>
            </nav>
          </div>
        </div>

        {showPublishSummary && summary ? (
          <section ref={publishSummaryRef} tabIndex={-1} className="admin-pricing__preview" role="dialog" aria-labelledby="pricing-publish-title">
            <h2 id="pricing-publish-title">Publish {selected.size} model{selected.size === 1 ? '' : 's'}?</h2>
            <p>
              The calculated prices are saved and {summary.priced} model{summary.priced === 1 ? '' : 's'} go
              {summary.priced === 1 ? 'es' : ''} on the live site.
              {summary.errors > 0
                ? ` ${summary.errors} cannot be priced and will stay waiting.`
                : ''} Each model is checked again before it goes live.
            </p>
            <div className="dashboard-card__actions">
              <Button type="button" isLoading={publishMutation.isPending} disabled={busy} onClick={() => publishMutation.mutate()}>
                Publish {selected.size} model{selected.size === 1 ? '' : 's'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowPublishSummary(false)}>Cancel</Button>
            </div>
          </section>
        ) : null}

        {publishResult ? (
          <section ref={publishResultRef} tabIndex={-1} className="admin-pricing__preview" aria-labelledby="pricing-publish-result-title">
            <h2 id="pricing-publish-result-title">
              {publishResult.published} published, {publishResult.failed} not published
            </h2>
            {publishResult.failed > 0 ? (
              <ul>
                {publishResult.results.filter((row) => !row.published).map((row) => (
                  <li key={row.id}><strong>{row.name || row.id}</strong>: {row.reason}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </section>
    </main>
  )
}
