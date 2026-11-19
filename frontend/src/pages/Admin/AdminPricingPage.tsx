import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { listAdminCategories } from '../../api/categoriesApi'
import {
  applyPricing,
  getPricingDefaults,
  listPricingBatches,
  listPricingModels,
  previewPricing,
  publishPricing,
  savePricingDefaults,
  savePricingInputs,
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
import { PACKAGE_LABELS, PACKAGE_ORDER, type PackageKind } from '../../lib/packages'
import { isLocalInputInPast, localInputToUtc } from '../../lib/saleEnd'
import { toast } from '../../lib/toast'
import {
  DEFAULT_HIGH_ABOVE,
  DEFAULT_LOW_BELOW,
  MAX_MODELS_PER_ACTION,
  MAX_PACKAGE_PERCENT,
  POLY_TIER_LABELS,
} from '../../types/pricing'
import type {
  PackagePercents,
  PolyTier,
  PricingInputItem,
  PricingPackage,
  PricingPreview,
  PricingPublishResult,
  PricingRow,
  PricingRuleRequest,
  PricingTab,
} from '../../types/pricing'
import '../../styles/admin-pricing.css'

const PAGE_SIZE = 50
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/
const TIERS: PolyTier[] = ['low', 'mid', 'high', 'unknown']

type Action = 'hours' | 'price' | 'sale' | 'remove'

/** What the admin typed in a row's hours, rate and percent boxes and has not saved yet. */
interface InputDraft {
  hours?: string
  rate?: string
  percents?: Partial<Record<PackageKind, string>>
}

/** A hours or rate box: a number above 0, or empty. */
function isPositiveNumber(value: string): boolean {
  return value.trim() === '' || (MONEY_PATTERN.test(value.trim()) && Number(value) > 0)
}

/** A percent box: empty (use the default) or above 0 and at most MAX_PACKAGE_PERCENT. */
function isPercent(value: string): boolean {
  const text = value.trim()
  return text === '' || (MONEY_PATTERN.test(text) && Number(text) > 0 && Number(text) <= MAX_PACKAGE_PERCENT)
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

function isMoney(value: string): boolean {
  return MONEY_PATTERN.test(value.trim()) && Number(value) > 0
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

  // Calculator: every rule prices one package of each selected model.
  const [packageKind, setPackageKind] = useState<PackageKind>('whole')
  const [action, setAction] = useState<Action>('hours')
  const [price, setPrice] = useState('')
  // The discount sale switch of the hours price: off unless the admin turns it on.
  const [saleOn, setSaleOn] = useState(false)
  const [salePercent, setSalePercent] = useState('')
  const [drafts, setDrafts] = useState<Record<string, InputDraft>>({})
  const [defaultsDraft, setDefaultsDraft] = useState<Partial<PackagePercents>>({})
  const [saleMode, setSaleMode] = useState<'percent' | 'amount'>('percent')
  const [percent, setPercent] = useState('')
  const [amount, setAmount] = useState('')
  const [round99, setRound99] = useState(false)
  const [saleEndLocal, setSaleEndLocal] = useState('')

  const [preview, setPreview] = useState<{ body: PricingRuleRequest; result: PricingPreview } | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [showPublishSummary, setShowPublishSummary] = useState(false)
  const [publishResult, setPublishResult] = useState<PricingPublishResult | null>(null)
  // The preview, the publish summary and the results open below the table: bring each
  // into view and move focus to it, or the click looks like it did nothing.
  const previewRef = useRef<HTMLElement>(null)
  const publishSummaryRef = useRef<HTMLElement>(null)
  const publishResultRef = useRef<HTMLElement>(null)
  useEffect(() => { if (preview) revealPanel(previewRef.current) }, [preview])
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
  const defaultsQuery = useQuery({
    queryKey: ['admin', 'pricing', 'defaults'],
    queryFn: getPricingDefaults,
  })
  const defaults = defaultsQuery.data
  const categories = categoriesQuery.data?.results ?? []
  const mainCategories = categories.filter((category) => !category.parent)
  const subcategories = categories.filter((category) => category.parent?.id === categoryId)

  const rows = modelsQuery.data?.results ?? []
  const selectedRows = useMemo(() => [...selected.values()], [selected])
  const selectedIds = selectedRows.map((row) => row.id)

  // Any change to the selection or the rule makes the preview stale.
  const resetPreview = () => {
    setPreview(null)
    setConfirmText('')
    setFormError(null)
  }
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
    resetPreview()
  }

  const toggle = (row: PricingRow) => {
    resetPreview()
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
    resetPreview()
  }

  const buildBody = (): PricingRuleRequest | string => {
    if (selectedIds.length === 0) return 'Select at least one model.'
    const base = { product_ids: selectedIds, package_kind: packageKind, ...thresholds }
    if (action === 'remove') return { ...base, rule: 'remove_sale' }
    if (action === 'hours') {
      if (Object.keys(drafts).length > 0) return 'Save the hours, rates and percents you changed first.'
      if (!saleOn) return { ...base, rule: 'hours_price', sale_enabled: false }
      const value = Number(salePercent)
      if (!MONEY_PATTERN.test(salePercent.trim()) || value <= 0 || value > 90) {
        return 'Enter the sale percentage, between 0.01 and 90.'
      }
      if (saleEndLocal && isLocalInputInPast(saleEndLocal)) return 'The sale end must be in the future.'
      return {
        ...base,
        rule: 'hours_price',
        sale_enabled: true,
        sale_percent: salePercent.trim(),
        discount_ends_at: localInputToUtc(saleEndLocal),
      }
    }
    if (action === 'price') {
      if (!isMoney(price)) return 'Enter the price, for example 12 or 24.99.'
      return { ...base, rule: 'set_price', price: price.trim() }
    }
    if (saleEndLocal && isLocalInputInPast(saleEndLocal)) return 'The sale end must be in the future.'
    const sale = { round_99: round99, discount_ends_at: localInputToUtc(saleEndLocal) }
    if (saleMode === 'percent') {
      const value = Number(percent)
      if (!MONEY_PATTERN.test(percent.trim()) || value <= 0 || value > 90) {
        return 'Enter a percentage between 0.01 and 90.'
      }
      return { ...base, rule: 'percent_off', percent: percent.trim(), ...sale }
    }
    if (!isMoney(amount)) return 'Enter the amount off, for example 3 or 2.50.'
    return { ...base, rule: 'amount_off', amount: amount.trim(), ...sale }
  }

  // Hours, rate and percents: typed into the table, saved with one button, then priced.
  const hoursOf = (row: PricingRow) => drafts[row.id]?.hours ?? row.hours_spent ?? ''
  const rateOf = (row: PricingRow) => drafts[row.id]?.rate ?? row.hourly_rate ?? ''
  const percentOf = (row: PricingRow, kind: PackageKind) =>
    drafts[row.id]?.percents?.[kind] ?? row.package_percents[kind] ?? ''
  const baseOf = (row: PricingRow) => {
    const hours = Number(hoursOf(row))
    const rate = Number(rateOf(row))
    return hours > 0 && rate > 0 ? `$${(hours * rate).toFixed(2)}` : '—'
  }
  const editDraft = (row: PricingRow, change: InputDraft) => {
    setDrafts((current) => ({
      ...current,
      [row.id]: {
        ...current[row.id],
        ...change,
        percents: { ...current[row.id]?.percents, ...change.percents },
      },
    }))
    resetPreview()
  }
  const draftsValid = Object.values(drafts).every(
    (draft) =>
      isPositiveNumber(draft.hours ?? '') &&
      isPositiveNumber(draft.rate ?? '') &&
      Object.values(draft.percents ?? {}).every(isPercent),
  )

  const inputItems = (): PricingInputItem[] =>
    Object.entries(drafts).map(([id, draft]) => {
      const item: PricingInputItem = { id }
      if (draft.hours !== undefined) item.hours_spent = draft.hours.trim() || null
      if (draft.rate !== undefined) item.hourly_rate = draft.rate.trim() || null
      if (draft.percents) {
        item.package_percents = Object.fromEntries(
          Object.entries(draft.percents).map(([kind, value]) => [kind, value.trim() || null]),
        )
      }
      return item
    })

  const inputsMutation = useMutation({
    mutationFn: () => savePricingInputs(inputItems()),
    onSuccess: async () => {
      toast.success('Hours, rates and percents saved.')
      setDrafts({})
      resetPreview()
      await refreshLists()
    },
    onError: (error) => setFormError(getApiErrorMessage(error, 'Could not save the hours and rates.')),
  })

  const defaultsMutation = useMutation({
    mutationFn: () =>
      savePricingDefaults(
        Object.fromEntries(
          Object.entries(defaultsDraft).filter(([, value]) => value.trim() !== ''),
        ) as Partial<PackagePercents>,
      ),
    onSuccess: async () => {
      toast.success('Default percentages saved.')
      setDefaultsDraft({})
      resetPreview()
      await queryClient.invalidateQueries({ queryKey: ['admin', 'pricing', 'defaults'] })
    },
    onError: (error) => setFormError(getApiErrorMessage(error, 'Could not save the default percentages.')),
  })
  const defaultsValid = Object.values(defaultsDraft).every((value) => value.trim() !== '' && isPercent(value))

  const previewMutation = useMutation({
    mutationFn: (body: PricingRuleRequest) => previewPricing(body).then((result) => ({ body, result })),
    onSuccess: (data) => {
      setPreview(data)
      setConfirmText('')
    },
    onError: (error) => setFormError(getApiErrorMessage(error, 'Could not calculate the preview.')),
  })

  const refreshLists = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'pricing'] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
  }

  const applyMutation = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error('No preview')
      const needsConfirm = preview.result.summary.needs_confirmation
      return applyPricing({
        ...preview.body,
        preview_token: preview.result.preview_token,
        confirm_count: needsConfirm ? Number(confirmText) : undefined,
      })
    },
    onSuccess: async (result) => {
      toast.success(`Saved: ${result.changed} model price${result.changed === 1 ? '' : 's'} changed.`)
      // The selection keeps each row as it was when ticked: give it the saved prices, so the
      // publish summary right after saving adds up (and counts) the new prices.
      const saved = new Map<string, { packages: Map<string, PricingPackage>; warning: string }>()
      for (const update of preview?.result.rows ?? []) {
        if (update.error || !update.package_kind) continue
        const entry = saved.get(update.id) ?? { packages: new Map(), warning: '' }
        const changed = update.packages.find((item) => item.kind === update.package_kind)
        if (changed) entry.packages.set(changed.kind, changed)
        entry.warning = update.bundle_warning
        saved.set(update.id, entry)
      }
      setSelected((current) => {
        const next = new Map(current)
        for (const [id, row] of current) {
          const update = saved.get(id)
          if (!update) continue
          const packages = row.packages.map((item) => update.packages.get(item.kind) ?? item)
          next.set(id, { ...row, packages, bundle_warning: update.warning })
        }
        return next
      })
      resetPreview()
      await refreshLists()
    },
    onError: (error) => {
      if (isAxiosError(error) && error.response?.status === 409) {
        setPreview(null)
        setFormError('Prices changed since the preview (or a sale ended). Calculate the preview again.')
        return
      }
      setFormError(getApiErrorMessage(error, 'Could not save the prices.'))
    },
  })

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

  const onPreview = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    const body = buildBody()
    if (typeof body === 'string') {
      setFormError(body)
      return
    }
    previewMutation.mutate(body)
  }

  const summary = preview?.result.summary
  const confirmOk = !summary?.needs_confirmation || confirmText.trim() === String(summary.models)
  const canSave =
    summary !== undefined && summary.errors === 0 && summary.changed > 0 && confirmOk
  // A model goes live only with every package priced (the server checks again).
  const unpriced = selectedRows.filter(
    (row) => row.packages.length === 0 || row.packages.some((item) => item.price === null || Number(item.price) < 0.5),
  ).length
  const busy =
    previewMutation.isPending ||
    applyMutation.isPending ||
    publishMutation.isPending ||
    inputsMutation.isPending ||
    defaultsMutation.isPending
  const hoursPreview = preview?.body.rule === 'hours_price'
  const previewScope = preview ? (hoursPreview ? 'All packages' : PACKAGE_LABELS[preview.body.package_kind]) : ''

  return (
    <main className="dashboard-page admin-pricing-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="admin-pricing-title">
        <header className="products-heading">
          <span className="products-heading__icon"><AdminIcon name="tag" size={32} /></span>
          <div>
            <h1 id="admin-pricing-title">Pricing</h1>
            <p className="home-page__subtitle">
              Set prices and sales for paid models. Every price is calculated by the server; nothing
              changes until you save, and waiting models go live only when you publish them.
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
                  onChange={(event) => { setLowBelow(event.target.value); resetPreview(); resetPage() }} />
              </FormField>
              <FormField id="pricing-high-above" label="High above">
                <Input id="pricing-high-above" type="number" min="1" value={highAbove}
                  onChange={(event) => { setHighAbove(event.target.value); resetPreview(); resetPage() }} />
              </FormField>
            </div>
            {!thresholdsValid ? <Alert variant="error" message="The Low limit must be at least 1 and not above the High limit." /> : null}
          </details>
        </div>

        <div className="admin-pricing__layout">
          <div className="admin-table-wrap">
            <div className="admin-pricing__selection">
              <strong>{selected.size} selected</strong>
              <span className="home-page__subtitle"> (at most {MAX_MODELS_PER_ACTION})</span>
              {selected.size > 0 ? (
                <Button type="button" variant="secondary" onClick={() => { setSelected(new Map()); resetPreview() }}>
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

            <div className="admin-pricing__inputs-bar">
              <Button
                type="button"
                variant="secondary"
                isLoading={inputsMutation.isPending}
                disabled={Object.keys(drafts).length === 0 || !draftsValid || busy}
                onClick={() => inputsMutation.mutate()}
              >
                Save hours, rates and percents ({Object.keys(drafts).length})
              </Button>
              {!draftsValid ? (
                <Alert variant="error" message={`Hours and rates must be above 0, and percents above 0 and at most ${MAX_PACKAGE_PERCENT}.`} />
              ) : null}
              <details className="admin-pricing__limits">
                <summary>Default package percentages</summary>
                <p className="home-page__subtitle">
                  Each package costs this share of the base price (hours × rate). A model can override
                  any of them in its Percents box. Saved prices do not move.
                </p>
                <div className="admin-pricing__limits-fields">
                  {PACKAGE_ORDER.map((kind) => (
                    <FormField key={kind} id={`pricing-default-${kind}`} label={`${PACKAGE_LABELS[kind]} %`}>
                      <Input
                        id={`pricing-default-${kind}`}
                        inputMode="decimal"
                        value={defaultsDraft[kind] ?? defaults?.[kind] ?? ''}
                        onChange={(event) => setDefaultsDraft((current) => ({ ...current, [kind]: event.target.value }))}
                      />
                    </FormField>
                  ))}
                </div>
                {!defaultsValid ? (
                  <Alert variant="error" message={`A percent must be above 0 and at most ${MAX_PACKAGE_PERCENT}.`} />
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  isLoading={defaultsMutation.isPending}
                  disabled={Object.keys(defaultsDraft).length === 0 || !defaultsValid || busy}
                  onClick={() => defaultsMutation.mutate()}
                >
                  Save default percentages
                </Button>
              </details>
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
                    <th scope="col">Hours</th>
                    <th scope="col">Rate / hour</th>
                    <th scope="col">Base price</th>
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
                      <td>
                        <Input
                          aria-label={`Hours for ${row.name}`}
                          inputMode="decimal"
                          className="admin-pricing__number"
                          value={hoursOf(row)}
                          onChange={(event) => editDraft(row, { hours: event.target.value })}
                        />
                      </td>
                      <td>
                        <Input
                          aria-label={`Rate per hour for ${row.name}`}
                          inputMode="decimal"
                          className="admin-pricing__number"
                          value={rateOf(row)}
                          onChange={(event) => editDraft(row, { rate: event.target.value })}
                        />
                      </td>
                      <td>
                        {baseOf(row)}
                        <details className="admin-pricing__percents">
                          <summary>Percents</summary>
                          {PACKAGE_ORDER.map((kind) => (
                            <label key={kind}>
                              <span>{PACKAGE_LABELS[kind]} %</span>
                              <Input
                                aria-label={`${PACKAGE_LABELS[kind]} percent for ${row.name}`}
                                inputMode="decimal"
                                className="admin-pricing__number"
                                placeholder={defaults?.[kind] ?? ''}
                                value={percentOf(row, kind)}
                                onChange={(event) => editDraft(row, { percents: { [kind]: event.target.value } })}
                              />
                            </label>
                          ))}
                        </details>
                      </td>
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

          <aside className="admin-pricing__panel" aria-labelledby="pricing-calculator-title">
            <h2 id="pricing-calculator-title">Calculator</h2>
            {formError ? <Alert variant="error" message={formError} /> : null}
            <form onSubmit={onPreview} noValidate>
              <fieldset className="admin-pricing__choice">
                <legend>Change</legend>
                {(
                  [
                    ['hours', 'Price from hours'],
                    ['price', 'Set the price'],
                    ['sale', 'Give a sale'],
                    ['remove', 'Remove the sale'],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value}>
                    <input type="radio" name="pricing-action" value={value} checked={action === value}
                      onChange={() => { setAction(value); resetPreview() }} />
                    {label}
                  </label>
                ))}
              </fieldset>

              {action === 'hours' ? (
                <>
                  <p className="home-page__subtitle">
                    Every package = hours × rate × its percent, in whole dollars. Enter the hours, rate
                    and percents in the table and save them, then calculate.
                  </p>
                  <label className="admin-pricing__check">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={saleOn}
                      onChange={(event) => { setSaleOn(event.target.checked); resetPreview() }}
                    />
                    Discount sale {saleOn ? 'ON' : 'OFF'}
                  </label>
                  <p className="home-page__subtitle">
                    {saleOn
                      ? 'The discount below is applied to every package of the selected models.'
                      : 'No discount is applied: normal prices only, and any running sale on these models is removed.'}
                  </p>
                  {saleOn ? (
                    <>
                      <FormField id="pricing-sale-percent" label="Discount percent (up to 90)">
                        <Input id="pricing-sale-percent" inputMode="decimal" value={salePercent}
                          onChange={(event) => { setSalePercent(event.target.value); resetPreview() }} />
                      </FormField>
                      <FormField id="pricing-sale-end" label="Sale ends (your local time, optional)">
                        <Input id="pricing-sale-end" type="datetime-local" value={saleEndLocal}
                          onChange={(event) => { setSaleEndLocal(event.target.value); resetPreview() }} />
                      </FormField>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <FormField id="pricing-package" label="Package">
                    <select
                      id="pricing-package"
                      className="ui-input"
                      value={packageKind}
                      onChange={(event) => { setPackageKind(event.target.value as PackageKind); resetPreview() }}
                    >
                      {PACKAGE_ORDER.map((kind) => <option key={kind} value={kind}>{PACKAGE_LABELS[kind]}</option>)}
                    </select>
                  </FormField>
                  <p className="home-page__subtitle">
                    This rule changes this package of each selected model. A model without it is left alone.
                  </p>
                </>
              )}

              {action === 'price' ? (
                <FormField id="pricing-price" label="Price (USD)">
                  <Input id="pricing-price" inputMode="decimal" value={price}
                    onChange={(event) => { setPrice(event.target.value); resetPreview() }} />
                </FormField>
              ) : null}

              {action === 'sale' ? (
                <>
                  <fieldset className="admin-pricing__choice">
                    <legend>Discount</legend>
                    <label><input type="radio" name="pricing-sale-mode" checked={saleMode === 'percent'}
                      onChange={() => { setSaleMode('percent'); resetPreview() }} /> Percentage off</label>
                    <label><input type="radio" name="pricing-sale-mode" checked={saleMode === 'amount'}
                      onChange={() => { setSaleMode('amount'); resetPreview() }} /> Amount off</label>
                  </fieldset>
                  {saleMode === 'percent' ? (
                    <FormField id="pricing-percent" label="Percent off (up to 90)">
                      <Input id="pricing-percent" inputMode="decimal" value={percent}
                        onChange={(event) => { setPercent(event.target.value); resetPreview() }} />
                    </FormField>
                  ) : (
                    <FormField id="pricing-amount" label="Amount off (USD)">
                      <Input id="pricing-amount" inputMode="decimal" value={amount}
                        onChange={(event) => { setAmount(event.target.value); resetPreview() }} />
                    </FormField>
                  )}
                  <label className="admin-pricing__check">
                    <input type="checkbox" checked={round99} onChange={(event) => { setRound99(event.target.checked); resetPreview() }} />
                    End sale prices in .99 (8.40 becomes 7.99)
                  </label>
                  <FormField id="pricing-sale-end" label="Sale ends (your local time, optional)">
                    <Input id="pricing-sale-end" type="datetime-local" value={saleEndLocal}
                      onChange={(event) => { setSaleEndLocal(event.target.value); resetPreview() }} />
                  </FormField>
                </>
              ) : null}

              <Button type="submit" variant="secondary" isLoading={previewMutation.isPending} disabled={busy || selected.size === 0}>
                Calculate preview ({selected.size})
              </Button>
            </form>
          </aside>
        </div>

        {preview && summary ? (
          <section ref={previewRef} tabIndex={-1} className="admin-pricing__preview" aria-labelledby="pricing-preview-title">
            <h2 id="pricing-preview-title">Preview</h2>
            <p>
              {summary.models} model{summary.models === 1 ? '' : 's'}, {summary.changed} will change
              {summary.errors > 0 ? `, ${summary.errors} cannot take this price` : ''}
              {summary.without_package > 0 ? `, ${summary.without_package} ${hoursPreview ? 'packages are missing' : `have no ${previewScope} package`}` : ''}.
              {' '}{previewScope}: buyers pay {money(summary.buyer_pays_before)} → {money(summary.buyer_pays_after)} in total.
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Model</th>
                    {hoursPreview ? <th scope="col">Package</th> : null}
                    <th scope="col">Price</th>
                    <th scope="col">Sale price</th>
                    <th scope="col">Off</th>
                    <th scope="col">Buyer pays</th>
                    {hoursPreview ? null : <th scope="col">All packages after saving</th>}
                    <th scope="col">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.result.rows.map((row) => (
                    <tr key={`${row.id}-${row.package_kind ?? ''}`} className={row.error ? 'admin-pricing__row--error' : undefined}>
                      <td>{row.name}<div className="home-page__subtitle">{row.sku ?? '—'}</div></td>
                      {hoursPreview ? <td>{row.package_label ?? '—'}</td> : null}
                      <td>{money(row.old_price)} → {money(row.new_price)}</td>
                      <td>
                        {money(row.old_sale_price)} → {money(row.new_sale_price)}
                        {row.new_sale_ends_at ? <div className="home-page__subtitle">until {when(row.new_sale_ends_at)}</div> : null}
                      </td>
                      <td>{row.new_sale_price ? `${money(row.amount_off)} (${row.percent_off}%)` : '—'}</td>
                      <td>{money(row.buyer_pays)}</td>
                      {hoursPreview ? null : (
                        <td><PackagePrices packages={row.packages} warning={row.bundle_warning} /></td>
                      )}
                      <td>
                        {row.error ||
                          (!row.has_package
                            ? `No ${row.package_label ?? previewScope} package: left as it is`
                            : row.changed ? 'Changes' : 'No change')}
                        {hoursPreview && row.bundle_warning && row.package_kind === 'whole' ? (
                          <p className="admin-pricing__bundle-warning" role="note">{row.bundle_warning}</p>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {summary.errors > 0 ? (
              <Alert variant="error" message="Remove the models with a note from the selection, or change the rule, then calculate again." />
            ) : null}
            {summary.needs_confirmation && summary.errors === 0 ? (
              <FormField id="pricing-confirm" label={`This sale takes more than 50% off. Type ${summary.models} to confirm.`}>
                <Input id="pricing-confirm" inputMode="numeric" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} />
              </FormField>
            ) : null}
            <Button type="button" isLoading={applyMutation.isPending} disabled={!canSave || busy} onClick={() => applyMutation.mutate()}>
              Save prices
            </Button>
          </section>
        ) : null}

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
