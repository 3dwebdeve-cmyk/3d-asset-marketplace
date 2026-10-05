import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import {
  deleteAdminReview,
  listAdminReviews,
  updateAdminReviewHidden,
} from '../../api/reviewsApi'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Input } from '../../components/ui/Input'
import { Pagination } from '../../components/ui/Pagination'
import { Spinner } from '../../components/ui/Spinner'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import type { ReviewProductType } from '../../types/review'
import { formatLocaleDateTime } from '../../lib/format'

function excerpt(text: string, max = 80): string {
  const trimmed = text.trim()
  if (!trimmed) return '—'
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}…`
}

export function AdminReviewsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [productType, setProductType] = useState('')
  const [hiddenFilter, setHiddenFilter] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebouncedValue(search)

  const reviewsQuery = useQuery({
    queryKey: [
      'admin',
      'reviews',
      {
        search: debouncedSearch,
        productType,
        hiddenFilter,
        page,
      },
    ],
    queryFn: () =>
      listAdminReviews({
        search: debouncedSearch || undefined,
        product_type: (productType || undefined) as ReviewProductType | undefined,
        is_hidden:
          hiddenFilter === 'true'
            ? true
            : hiddenFilter === 'false'
              ? false
              : undefined,
        page,
        page_size: 20,
        ordering: '-created_at',
      }),
  })

  const hideMutation = useMutation({
    mutationFn: ({ id, isHidden }: { id: string; isHidden: boolean }) =>
      updateAdminReviewHidden(id, isHidden),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] })
      toast.success('Review visibility updated.')
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Could not update review.'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminReview(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] })
      toast.success('Review deleted.')
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Could not delete review.'))
    },
  })

  const results = reviewsQuery.data?.results ?? []
  const count = reviewsQuery.data?.count ?? 0

  return (
    <main className="dashboard-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="admin-reviews-title">
        <p className="admin-page__eyebrow">Administrator</p>
        <h1 id="admin-reviews-title">Reviews</h1>
        <p className="home-page__subtitle">
          Moderate customer ratings. Hidden reviews are removed from public averages.
        </p>

        <div className="admin-filters">
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Search review text, name, or email"
            aria-label="Search reviews"
          />
          <select
            className="auth-input"
            value={productType}
            onChange={(event) => {
              setProductType(event.target.value)
              setPage(1)
            }}
            aria-label="Filter by product type"
          >
            <option value="">All types</option>
            <option value="product">Products</option>
            <option value="plugin">Plugins</option>
          </select>
          <select
            className="auth-input"
            value={hiddenFilter}
            onChange={(event) => {
              setHiddenFilter(event.target.value)
              setPage(1)
            }}
            aria-label="Filter by visibility"
          >
            <option value="">All visibility</option>
            <option value="false">Visible</option>
            <option value="true">Hidden</option>
          </select>
        </div>

        {reviewsQuery.isLoading ? (
          <Spinner label="Loading reviews..." />
        ) : reviewsQuery.isError ? (
          <ErrorState
            title="Could not load reviews"
            description="Something went wrong while loading reviews."
            action={
              <Button variant="secondary" onClick={() => reviewsQuery.refetch()}>
                Retry
              </Button>
            }
          />
        ) : results.length === 0 ? (
          <p className="home-page__subtitle">No reviews match these filters.</p>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Author</th>
                    <th>Item</th>
                    <th>Rating</th>
                    <th>Review</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((review) => {
                    const catalogHref =
                      review.product_type === 'product'
                        ? `/console/products/${review.product_id}`
                        : `/console/plugins/${review.product_id}`
                    return (
                      <tr key={review.id}>
                        <td>{formatLocaleDateTime(review.created_at)}</td>
                        <td>
                          <div>{review.author.full_name}</div>
                          <div className="home-page__subtitle">{review.author_email}</div>
                        </td>
                        <td>
                          <Link className="auth-link" to={catalogHref}>
                            {review.catalog?.name ?? review.product_id}
                          </Link>
                          <div className="home-page__subtitle">{review.product_type}</div>
                        </td>
                        <td>{review.rating === null ? '—' : `${review.rating} / 5`}</td>
                        <td>{excerpt(review.review_text)}</td>
                        <td>
                          <span
                            className={`status-badge status-badge--${
                              review.is_hidden ? 'danger' : 'success'
                            }`}
                          >
                            {review.is_hidden ? 'Hidden' : 'Visible'}
                          </span>
                        </td>
                        <td>
                          <div className="dashboard-card__actions">
                            <Button
                              variant="secondary"
                              disabled={hideMutation.isPending || deleteMutation.isPending}
                              onClick={() =>
                                hideMutation.mutate({
                                  id: review.id,
                                  isHidden: !review.is_hidden,
                                })
                              }
                            >
                              {review.is_hidden ? 'Unhide' : 'Hide'}
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={hideMutation.isPending || deleteMutation.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    'Permanently delete this review? This cannot be undone.',
                                  )
                                ) {
                                  deleteMutation.mutate(review.id)
                                }
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              totalPages={Math.ceil(count / 20)}
              onPageChange={setPage}
              ariaLabel="Review pagination"
            />
          </>
        )}
      </section>
    </main>
  )
}
