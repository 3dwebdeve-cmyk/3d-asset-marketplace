import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'

import { Button } from '../ui/Button'
import { ErrorState } from '../ui/ErrorState'
import { FormField } from '../ui/FormField'
import { Spinner } from '../ui/Spinner'
import { useReviews } from '../../hooks/useReviews'
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

export function ReviewsSection({
  productType,
  productId,
  catalogSlug,
  averageRating,
  reviewCount,
}: ReviewsSectionProps) {
  const [page, setPage] = useState(1)
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

  return (
    <section className="product-detail-reviews" aria-labelledby="product-reviews-heading">
      <div className="product-detail-reviews__header">
        <h2 id="product-reviews-heading" className="product-detail-section-title">
          Reviews
        </h2>
        <p className="product-detail-reviews__summary">
          {reviewCount > 0 && ratingNumber > 0
            ? `${ratingNumber.toFixed(1)} average · ${reviewCount.toLocaleString()} review${
                reviewCount === 1 ? '' : 's'
              }`
            : ratingNumber > 0
              ? `${ratingNumber.toFixed(1)} average`
              : 'No reviews yet'}
        </p>
      </div>

      <div className="product-detail-reviews__form-panel">
        {!isSignedIn ? (
          <p className="product-detail-reviews__gate">
            <Link to="/login" className="auth-link">
              Sign in
            </Link>{' '}
            to leave a review after purchasing this item.
          </p>
        ) : isEligibilityLoading ? (
          <Spinner label="Checking review eligibility..." />
        ) : canReview ? (
          <form className="product-detail-reviews__form" onSubmit={onSubmit} noValidate>
            <h3 className="product-detail-reviews__form-title">
              {hasReviewed ? 'Update your review' : 'Write a review'}
            </h3>
            <FormField label="Rating" id="review-rating" error={errors.rating?.message}>
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
                      selectedRating >= value
                        ? ' product-detail-reviews__star--active'
                        : ''
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
            <Button type="submit" disabled={isSubmitting || !selectedRating}>
              {isSubmitting
                ? 'Saving…'
                : hasReviewed
                  ? 'Update review'
                  : 'Submit review'}
            </Button>
          </form>
        ) : (
          <p className="product-detail-reviews__gate">
            Purchase this item to leave a review. Admins can mark test orders as paid from the
            Orders admin page.
          </p>
        )}
      </div>

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
                <strong>{review.author.full_name}</strong>
                <span aria-label={`${review.rating} out of 5 stars`}>
                  {'★'.repeat(review.rating)}
                  {'☆'.repeat(5 - review.rating)}
                </span>
                <time dateTime={review.created_at}>{formatDate(review.created_at)}</time>
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
    </section>
  )
}
