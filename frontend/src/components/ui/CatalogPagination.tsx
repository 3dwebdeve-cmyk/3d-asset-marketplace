import { Link } from 'react-router-dom'
import '../../styles/pagination.css'

interface CatalogPaginationProps {
  page: number
  totalPages: number
  pageHref: (page: number) => string
}

/** Real links support browser history and discovery without JavaScript. */
export function CatalogPagination({ page, totalPages, pageHref }: CatalogPaginationProps) {
  if (totalPages <= 1) return null
  const pages = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b)
  return (
    <div className="ui-pagination-wrap">
      <nav className="ui-pagination" aria-label="Model catalog pages">
        {page > 1 ? <Link className="ui-pagination__nav-btn" to={pageHref(page - 1)} aria-label="Previous page">‹</Link>
          : <span className="ui-pagination__nav-btn" aria-disabled="true" aria-label="Previous page">‹</span>}
        <div className="ui-pagination__pages">
          {pages.map((value, index) => (
            <span key={value}>
              {index > 0 && value - pages[index - 1] > 1 ? <span className="ui-pagination__ellipsis" aria-hidden="true">…</span> : null}
              <Link className={`ui-pagination__page${value === page ? ' ui-pagination__page--active' : ''}`}
                to={pageHref(value)} aria-label={`Page ${value}`} aria-current={value === page ? 'page' : undefined}>{value}</Link>
            </span>
          ))}
        </div>
        {page < totalPages ? <Link className="ui-pagination__nav-btn" to={pageHref(page + 1)} aria-label="Next page">›</Link>
          : <span className="ui-pagination__nav-btn" aria-disabled="true" aria-label="Next page">›</span>}
      </nav>
    </div>
  )
}
