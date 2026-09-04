import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation } from 'react-router-dom'
import { z } from 'zod'

import { AuthEntryButton } from '../auth/AuthEntryButton'

import { Button } from '../ui/Button'
import { ErrorState } from '../ui/ErrorState'
import { FormField } from '../ui/FormField'
import { Spinner } from '../ui/Spinner'
import { useReviews, type ReviewOrdering } from '../../hooks/useReviews'
import { useAuthStore } from '../../store/authStore'
import type { ReviewProductType } from '../../types/review'

const reviewSchema = z.object({
  rating: z.number().int().min(1, 'Select a rating').max(5),
  review_text: z.string().max(2000, 'Review must be at most 2000 characters').optional(),
})

type ReviewFormValues = {
  rating: number
  review_text: string
}

interface ReviewsSectionProps {
  productType: ReviewProductType
  productId: string
  catalogSlug: string
  averageRating: string
  reviewCount: number
  layout?: 'default' | 'hub'
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatRelative(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return formatDate(value)
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatDate(value)
}

function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

const SORT_OPTIONS: Array<{ value: ReviewOrdering; label: string }> = [
  { value: '-created_at', label: 'Newest' },
  { value: 'created_at', label: 'Oldest' },
  { value: '-rating', label: 'Highest rated' },
  { value: 'rating', label: 'Lowest rated' },
]

export function ReviewsSection({
  productType,
  productId,
  catalogSlug,
  averageRating,
  reviewCount,
  layout = 'default',
}: ReviewsSectionProps) {
  const location = useLocation()
  const currentUser = useAuthStore((state) => state.user)
  const [page, setPage] = useState(1)
  const [ordering, setOrdering] = useState<ReviewOrdering>('-created_at')
  const isHub = layout === 'hub'

  const {
    isSignedIn,
    reviews,
    reviewCount: listCount,
    hasNextPage,
    hasPreviousPage,
    isLoading,
    isError,
    refetch,
    canReview,
    hasReviewed,
    myReview,
    isEligibilityLoading,
    submitReview,
    isSubmitting,
  } = useReviews({
    productType,
    productId,
    catalogSlug,
    page,
    pageSize: 10,
    ordering,
  })

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    reset,
    formState: { errors },
  } = useForm<ReviewFormValues>({
    defaultValues: {
      rating: 0,
      review_text: '',
    },
  })

  const selectedRating = watch('rating')
  const reviewText = watch('review_text') ?? ''

  useEffect(() => {
    if (myReview) {
      reset({
        rating: myReview.rating,
        review_text: myReview.review_text,
      })
    }
  }, [myReview, reset])

  const onSubmit = handleSubmit((values) => {
    const parsed = reviewSchema.safeParse(values)
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0]
        if (field === 'rating' || field === 'review_text') {
          setError(field, {
            type: 'manual',
            message: issue.message,
          })
        }
      })
      return
    }

    submitReview({
      rating: parsed.data.rating,
      review_text: parsed.data.review_text?.trim() ?? '',
    })
  })

  const ratingNumber = Number(averageRating)
  const studioHandle = currentUser?.full_name?.trim() || 'Your account'

  const formPanel = (
    <div className="product-detail-reviews__form-panel">
      {!isSignedIn ? (
        <p className="product-detail-reviews__gate">
          <AuthEntryButton
            mode="login"
            returnTo={location.pathname}
            className="auth-link auth-link--button"
          >
            Sign in
          </AuthEntryButton>{' '}
          to leave a review after purchasing this item.
        </p>
      ) : isEligibilityLoading ? (
        <Spinner label="Checking review eligibility..." />
      ) : canReview ? (
        <form className="product-detail-reviews__form" onSubmit={onSubmit} noValidate>
          {isHub ? (
            <div className="product-detail-reviews__name-field">
              <label className="visually-hidden" htmlFor="review-studio-handle">
                Posting as
              </label>
              <input
                id="review-studio-handle"
                className="auth-input product-detail-reviews__name-input"
                type="text"
                value={studioHandle}
                readOnly
                aria-readonly="true"
                placeholder="Your Name / Studio Handle"
                title="Reviews post under your signed-in account name"
              />
            </div>
          ) : (
            <h3 className="product-detail-reviews__form-title">
              {hasReviewed ? 'Update your review' : 'Write a review'}
            </h3>
          )}

          <FormField
            label={isHub ? 'Rating' : 'Rating'}
            id="review-rating"
            error={errors.rating?.message}
          >
            <div
              id="review-rating"
              className="product-detail-reviews__stars"
              role="radiogroup"
              aria-label="Star rating"
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`product-detail-reviews__star${
                    selectedRating >= value ? ' product-detail-reviews__star--active' : ''
                  }`}
                  aria-checked={selectedRating === value}
                  role="radio"
                  onClick={() =>
                    setValue('rating', value, { shouldValidate: true, shouldDirty: true })
                  }
                >
                  ★
                </button>
              ))}
            </div>
          </FormField>

          {isHub ? (
            <div className="form-field">
              <label className="visually-hidden" htmlFor="review-text">
                Comment
              </label>
              <div className="product-detail-reviews__textarea-wrap">
                <textarea
                  id="review-text"
                  className="auth-input product-detail-reviews__textarea"
                  rows={5}
                  maxLength={2000}
                  placeholder="Write a comment or ask about Blender/Unreal compatibility…"
                  aria-invalid={Boolean(errors.review_text)}
                  {...register('review_text')}
                />
                <p className="product-detail-reviews__counter" aria-live="polite">
                  {reviewText.length} / 2000
                </p>
              </div>
              {errors.review_text?.message ? (
                <p id="review-text-error" className="form-field__error" role="alert">
                  {errors.review_text.message}
                </p>
              ) : null}
            </div>
          ) : (
            <FormField
              label="Review (optional)"
              id="review-text"
              error={errors.review_text?.message}
            >
              <textarea
                id="review-text"
                className="auth-input product-detail-reviews__textarea"
                rows={4}
                maxLength={2000}
                placeholder="Share what you liked about this asset…"
                {...register('review_text')}
              />
            </FormField>
          )}

          <Button
            type="submit"
            className={isHub ? 'product-detail-reviews__submit' : undefined}
            disabled={isSubmitting || !selectedRating}
          >
            {isSubmitting
              ? 'Saving…'
              : hasReviewed
                ? 'Update review'
                : isHub
                  ? 'Post Comment'
                  : 'Submit review'}
          </Button>
        </form>
      ) : (
        <p className="product-detail-reviews__gate">
          Purchase this item to leave a review.
        </p>
      )}
    </div>
  )

  const listPanel = (
    <>
      {isLoading ? (
        <Spinner label="Loading reviews..." />
      ) : isError ? (
        <ErrorState
          title="Could not load reviews"
          description="Something went wrong while loading reviews for this item."
          action={
            <Button variant="secondary" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      ) : reviews.length === 0 ? (
        <p className="product-detail-reviews__empty">Be the first to leave a review.</p>
      ) : (
        <ul className="product-detail-reviews__list">
          {reviews.map((review) => (
            <li key={review.id} className="product-detail-reviews__item">
              <div className="product-detail-reviews__item-header">
                {isHub ? (
                  <span className="product-detail-reviews__avatar" aria-hidden="true">
                    {authorInitials(review.author.full_name)}
                  </span>
                ) : null}
                <div className="product-detail-reviews__item-meta">
                  <div className="product-detail-reviews__item-top">
                    <div className="product-detail-reviews__item-identity">
                      <strong>{review.author.full_name}</strong>
                      {isHub ? (
                        <span className="product-detail-reviews__verified">Verified Buyer</span>
                      ) : null}
                    </div>
                    <time dateTime={review.created_at}>
                      {isHub ? formatRelative(review.created_at) : formatDate(review.created_at)}
                    </time>
                  </div>
                  <span
                    className="product-detail-reviews__item-stars"
                    aria-label={`${review.rating} out of 5 stars`}
                  >
                    {'★'.repeat(review.rating)}
                    <span className="product-detail-reviews__item-stars-empty" aria-hidden="true">
                      {'★'.repeat(5 - review.rating)}
                    </span>
                  </span>
                </div>
              </div>
              {review.review_text.trim() ? (
                <p className="product-detail-reviews__item-body">{review.review_text}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {listCount > 10 ? (
        <div className="product-detail-reviews__pagination">
          <Button
            variant="secondary"
            disabled={!hasPreviousPage || page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <span>Page {page}</span>
          <Button
            variant="secondary"
            disabled={!hasNextPage}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </>
  )

  return (
    <section
      className={`product-detail-reviews${isHub ? ' product-detail-reviews--hub' : ''}`}
      aria-labelledby="product-reviews-heading"
    >
      <div className="product-detail-reviews__header">
        <h2 id="product-reviews-heading" className="product-detail-section-title">
          {isHub ? (
            <>
              <span className="product-detail-reviews__title-icon" aria-hidden="true">
                ★
              </span>
              Reviews &amp; Comments ({reviewCount})
            </>
          ) : (
            'Reviews'
          )}
        </h2>
        {isHub ? (
          <label className="product-detail-reviews__sort">
            <span>Sort by:</span>
            <select
              value={ordering}
              onChange={(event) => {
                setOrdering(event.target.value as ReviewOrdering)
                setPage(1)
              }}
              aria-label="Sort reviews"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="product-detail-reviews__summary">
            {reviewCount > 0 && ratingNumber > 0
              ? `${ratingNumber.toFixed(1)} average · ${reviewCount.toLocaleString()} review${
                  reviewCount === 1 ? '' : 's'
                }`
              : ratingNumber > 0
                ? `${ratingNumber.toFixed(1)} average`
                : 'No reviews yet'}
          </p>
        )}
      </div>

      {isHub ? (
        <div className="product-detail-reviews__columns">
          {formPanel}
          <div className="product-detail-reviews__list-panel">{listPanel}</div>
        </div>
      ) : (
        <>
          {formPanel}
          {listPanel}
        </>
      )}
    </section>
  )
}
