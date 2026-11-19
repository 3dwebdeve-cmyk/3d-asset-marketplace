import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { listAdminCategories } from '../../api/categoriesApi'
import { listPricingBatches, listPricingModels, publishPricing } from '../../api/pricingApi'
import { AdminIcon } from '../../components/admin/AdminIcon'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import {
  DEFAULT_HIGH_ABOVE,
  DEFAULT_LOW_BELOW,
  MAX_MODELS_PER_ACTION,
  POLY_TIER_LABELS,
} from '../../types/pricing'
import type {
  PolyTier,
  PricingPackage,
  PricingPublishResult,
  PricingRow,
  PricingTab,
} from '../../types/pricing'
import '../../styles/admin-pricing.css'

const PAGE_SIZE = 50
const TIERS: PolyTier[] = ['low', 'mid', 'high', 'unknown']

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

/** A model's packages with their prices; a package with no price is shown as not set. */
function PackagePrices({ packages, warning }: { packages: PricingPackage[]; warning: string }) {
  if (packages.length === 0) return <em>No packages</em>
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
          </li>
        ))}
      </ul>
      {warning ? <p className="admin-pricing__bundle-warning" role="note">{warning}</p> : null}
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
  const [poly, setPoly] = useState<PolyTier | ''>('')
  const [lowBelow, setLowBelow] = useState(String(DEFAULT_LOW_BELOW))
  const [highAbove, setHighAbove] = useState(String(DEFAULT_HIGH_ABOVE))
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput.trim(), 300)
  const [batch, setBatch] = useState('')
  const [ordering, setOrdering] = useState('name')
  const [page, setPage] = useState(1)

  // Selection survives paging; at most MAX_MODELS_PER_ACTION models.
  const [selected, setSelected] = useState<Map<string, PricingRow>>(() => new Map())

  const [formError, setFormError] = useState<string | null>(null)
  const [showPublishSummary, setShowPublishSummary] = useState(false)
  const [publishResult, setPublishResult] = useState<PricingPublishResult | null>(null)
  // The publish summary and the results open below the table: bring each into view and
  // move focus to it, or the click looks like it did nothing.
  const publishSummaryRef = useRef<HTMLElement>(null)
  const publishResultRef = useRef<HTMLElement>(null)
  useEffect(() => { if (showPublishSummary) revealPanel(publishSummaryRef.current) }, [showPublishSummary])
  useEffect(() => { if (publishResult) revealPanel(publishResultRef.current) }, [publishResult])

  const thresholds = {
    low_below: Number(lowBelow) || DEFAULT_LOW_BELOW,
    high_above: Number(highAbove) || DEFAULT_HIGH_ABOVE,
  }
  const thresholdsValid = thresholds.low_below >= 1 && thresholds.high_above >= thresholds.low_below

  const listParams = {
    tab,
    category_id: categoryId || undefined,
    subcategory_id: subcategoryId || undefined,
    poly: poly || undefined,
    search: search || undefined,
    import_batch_id: batch || undefined,
    ordering,
    page,
    page_size: PAGE_SIZE,
    ...thresholds,
  }

  const modelsQuery = useQuery({
    queryKey: ['admin', 'pricing', 'list', listParams],
    queryFn: () => listPricingModels(listParams),
    enabled: thresholdsValid,
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

  const resetPage = () => setPage(1)

  const switchTab = (next: PricingTab) => {
    const params = new URLSearchParams(searchParams)
    params.set('tab', next)
    setSearchParams(params)
    setSelected(new Map())
    setBatch('')
    setPage(1)
    setShowPublishSummary(false)
    setPublishResult(null)
    setFormError(null)
  }

  const toggle = (row: PricingRow) => {
    setFormError(null)
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
    setFormError(null)
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

  const publishMutation = useMutation({
    mutationFn: () => publishPricing(selectedIds, selectedIds.length),
    onSuccess: async (result) => {
      setPublishResult(result)
      setShowPublishSummary(false)
      setSelected((current) => {
        const next = new Map(current)
        result.results.filter((row) => row.published).forEach((row) => next.delete(row.id))
        return next
      })
      toast.success(`${result.published} model${result.published === 1 ? '' : 's'} published.`)
      await refreshLists()
    },
    onError: (error) => setFormError(getApiErrorMessage(error, 'Could not publish the models.')),
  })

  // A model goes live only with every package priced (the server checks again).
  const unpriced = selectedRows.filter(
    (row) => row.packages.length === 0 || row.packages.some((item) => item.price === null || Number(item.price) < 0.5),
  ).length
  const busy = publishMutation.isPending

  return (
    <main className="dashboard-page admin-pricing-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="admin-pricing-title">
        <header className="products-heading">
          <span className="products-heading__icon"><AdminIcon name="tag" size={32} /></span>
          <div>
            <h1 id="admin-pricing-title">Pricing</h1>
            <p className="home-page__subtitle">
              Paid models wait here after QA. Waiting models go live only when you publish them.
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
          <FormField id="pricing-poly" label="Poly level">
            <select
              id="pricing-poly"
              className="ui-input"
              value={poly}
              onChange={(event) => { setPoly(event.target.value as PolyTier | ''); resetPage() }}
            >
              <option value="">All levels</option>
              {TIERS.map((tier) => <option key={tier} value={tier}>{POLY_TIER_LABELS[tier]}</option>)}
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
              <option value="polygon_count">Polygons low–high</option>
              <option value="-polygon_count">Polygons high–low</option>
            </select>
          </FormField>
          <details className="admin-pricing__limits">
            <summary>Poly level limits</summary>
            <p className="home-page__subtitle">Low: fewer than the first number. High: more than the second. Mid: in between.</p>
            <div className="admin-pricing__limits-fields">
              <FormField id="pricing-low-below" label="Low below">
                <Input id="pricing-low-below" type="number" min="1" value={lowBelow}
                  onChange={(event) => { setLowBelow(event.target.value); resetPage() }} />
              </FormField>
              <FormField id="pricing-high-above" label="High above">
                <Input id="pricing-high-above" type="number" min="1" value={highAbove}
                  onChange={(event) => { setHighAbove(event.target.value); resetPage() }} />
              </FormField>
            </div>
            {!thresholdsValid ? <Alert variant="error" message="The Low limit must be at least 1 and not above the High limit." /> : null}
          </details>
        </div>

        <div className="admin-pricing__layout">
          <div className="admin-table-wrap">
            {formError ? <Alert variant="error" message={formError} /> : null}
            <div className="admin-pricing__selection">
              <strong>{selected.size} selected</strong>
              <span className="home-page__subtitle"> (at most {MAX_MODELS_PER_ACTION})</span>
              {selected.size > 0 ? (
                <Button type="button" variant="secondary" onClick={() => { setSelected(new Map()); setFormError(null) }}>
                  Clear selection
                </Button>
              ) : null}
              {tab === 'waiting' ? (
                <Button
                  type="button"
                  disabled={selected.size === 0 || busy}
                  onClick={() => { setPublishResult(null); setShowPublishSummary(true) }}
                >
                  Publish selected ({selected.size})
                </Button>
              ) : null}
            </div>

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
                    <th scope="col">Level</th>
                    <th scope="col">Packages</th>
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
                      <td><span className={`admin-pricing__tier admin-pricing__tier--${row.poly_tier}`}>{POLY_TIER_LABELS[row.poly_tier]}</span></td>
                      <td><PackagePrices packages={row.packages} warning={row.bundle_warning} /></td>
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

        {showPublishSummary ? (
          <section ref={publishSummaryRef} tabIndex={-1} className="admin-pricing__preview" role="dialog" aria-labelledby="pricing-publish-title">
            <h2 id="pricing-publish-title">Publish {selected.size} model{selected.size === 1 ? '' : 's'}?</h2>
            <p>
              They go on the store with the package prices shown.
              {unpriced > 0 ? ` ${unpriced} have a package with no price yet and will stay waiting.` : ''} Each
              model is checked again before it goes live.
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
