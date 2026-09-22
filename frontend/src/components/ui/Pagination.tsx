import '../../styles/pagination.css'

export interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  ariaLabel?: string
  className?: string
}

function buildPageItems(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 1) return total === 1 ? [1] : []
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1)
  }

  const pages = new Set<number>([1, current, total])
  if (total > 2) pages.add(total - 1)

  const sorted = [...pages].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  const items: Array<number | 'ellipsis'> = []

  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      items.push('ellipsis')
    }
    items.push(sorted[i])
  }

  return items
}

function clampPage(value: number, totalPages: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(totalPages, Math.max(1, Math.trunc(value)))
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  ariaLabel = 'Pagination Navigation',
  className = '',
}: PaginationProps) {
  if (totalPages <= 1) return null

  const safePage = clampPage(page, totalPages)
  const pageItems = buildPageItems(safePage, totalPages)

  const goTo = (next: number) => {
    const clamped = clampPage(next, totalPages)
    if (clamped === safePage) return
    onPageChange(clamped)
  }

  return (
    <div className="ui-pagination-wrap">
      <nav className={`ui-pagination ${className}`.trim()} aria-label={ariaLabel}>
        <button
          type="button"
          className="ui-pagination__nav-btn"
          aria-label="Previous page"
          disabled={safePage <= 1}
          onClick={() => goTo(safePage - 1)}
        >
          <span aria-hidden="true">‹</span>
        </button>

        <div className="ui-pagination__pages" role="list">
          {pageItems.map((item, index) =>
            item === 'ellipsis' ? (
              <span
                key={`ellipsis-${index}`}
                className="ui-pagination__ellipsis"
                role="presentation"
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                role="listitem"
                className={`ui-pagination__page${item === safePage ? ' ui-pagination__page--active' : ''}`}
                aria-label={`Page ${item}`}
                aria-current={item === safePage ? 'page' : undefined}
                onClick={() => goTo(item)}
              >
                {item}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          className="ui-pagination__nav-btn"
          aria-label="Next page"
          disabled={safePage >= totalPages}
          onClick={() => goTo(safePage + 1)}
        >
          <span aria-hidden="true">›</span>
        </button>
      </nav>
    </div>
  )
}
