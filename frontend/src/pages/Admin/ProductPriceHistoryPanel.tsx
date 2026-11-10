import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { getAdminProductPriceHistory } from '../../api/priceHistoryApi'
import { Button } from '../../components/ui/Button'
import { getApiErrorMessage } from '../../lib/apiError'
import { formatMoneyPlain } from '../../lib/format'
import type { ProductPriceChange } from '../../types/priceHistory'
import '../../styles/admin-price-history.css'

interface ProductPriceHistoryPanelProps {
  productId: string
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—'
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

function formatChange(oldValue: string | null, newValue: string | null, currency: string): string {
  return `${formatMoneyPlain(oldValue, currency)} → ${formatMoneyPlain(newValue, currency)}`
}

function formatDateChange(oldValue: string | null, newValue: string | null): string {
  return `${formatDateTime(oldValue)} → ${formatDateTime(newValue)}`
}

function actorName(change: ProductPriceChange): string {
  const actor = change.changed_by
  if (!actor) {
    return 'System'
  }
  return actor.full_name || actor.email
}

/** Collapsible, read-only list of every price, sale price and sale end change of this product. */
export function ProductPriceHistoryPanel({ productId }: ProductPriceHistoryPanelProps) {
  const [open, setOpen] = useState(false)

  const historyQuery = useQuery({
    queryKey: ['admin', 'products', productId, 'price-history'],
    queryFn: () => getAdminProductPriceHistory(productId),
    enabled: open,
    staleTime: 0,
  })

  const rows = historyQuery.data?.results ?? []

  return (
    <section className="admin-price-history" aria-labelledby="price-history-title">
      <h2 id="price-history-title" className="admin-price-history__heading">
        <button
          type="button"
          className="admin-price-history__toggle"
          aria-expanded={open}
          aria-controls="price-history-body"
          onClick={() => setOpen((current) => !current)}
        >
          <span>Price history</span>
          <span aria-hidden="true">{open ? '−' : '+'}</span>
        </button>
      </h2>

      {open ? (
        <div id="price-history-body" className="admin-price-history__body">
          {historyQuery.isPending ? (
            <p role="status">Loading price history...</p>
          ) : historyQuery.isError ? (
            <div role="alert">
              <p>{getApiErrorMessage(historyQuery.error, 'The price history could not be loaded.')}</p>
              <Button
                type="button"
                variant="secondary"
                isLoading={historyQuery.isFetching}
                onClick={() => historyQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <p>No price changes yet.</p>
          ) : (
            <div className="admin-price-history__scroll">
              <table className="admin-price-history__table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Who</th>
                    <th scope="col">Source</th>
                    <th scope="col">Price</th>
                    <th scope="col">Sale price</th>
                    <th scope="col">Sale ends</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((change) => (
                    <tr key={change.id}>
                      <td>{formatDateTime(change.created_at)}</td>
                      <td>{actorName(change)}</td>
                      <td>{change.source_label}</td>
                      <td>{formatChange(change.old_price, change.new_price, change.currency)}</td>
                      <td>
                        {formatChange(change.old_discount_price, change.new_discount_price, change.currency)}
                      </td>
                      <td>{formatDateChange(change.old_discount_ends_at, change.new_discount_ends_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}
