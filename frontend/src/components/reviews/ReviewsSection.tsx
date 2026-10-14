import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation } from 'react-router-dom'
import { z } from 'zod'

import { AuthEntryButton } from '../auth/AuthEntryButton'

import { Button } from '../ui/Button'
import { ErrorState } from '../ui/ErrorState'
import { FormField } from '../ui/FormField'
import { Pagination } from '../ui/Pagination'
import { Spinner } from '../ui/Spinner'
import { useReviews, type ReviewOrdering } from '../../hooks/useReviews'
import { useAuthStore } from '../../store/authStore'
import type { ReviewProductType } from '../../types/review'
import { formatDate } from '../../lib/format'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import { createReviewReply, toggleReviewReaction, toggleReviewReplyReaction } from '../../api/reviewsApi'

const reviewSchema = z.object({
  rating: z.number().int().min(0).max(5),
  review_text: z.string().max(2000, 'Review must be at most 2000 characters').optional(),
}).refine((value) => value.rating > 0 || Boolean(value.review_text?.trim()), {
  path: ['review_text'],
  message: 'Write a comment or select a rating',
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
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyParentId, setReplyParentId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [commentActionPending, setCommentActionPending] = useState(false)
  const isHub = layout === 'hub'

  const reactToComment = async (reviewId: string, value: 'like' | 'dislike') => {
    if (!isSignedIn || commentActionPending) return
    setCommentActionPending(true)
    try {
      await toggleReviewReaction(reviewId, value)
      await refetch()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not update your reaction. Please try again.'))
    } finally {
      setCommentActionPending(false)
    }
  }

  const reactToReply = async (replyId: string, value: 'like' | 'dislike') => {
    if (!isSignedIn || commentActionPending) return
    setCommentActionPending(true)
    try {
      await toggleReviewReplyReaction(replyId, value)
      await refetch()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not update your reaction. Please try again.'))
    } finally {
      setCommentActionPending(false)
    }
  }

  const postReply = async (reviewId: string, parentId: string | null = null) => {
    const text = replyText.trim()
    if (!text || commentActionPending) return
    setCommentActionPending(true)
    try {
      await createReviewReply(reviewId, text, parentId)
      setReplyText('')
      setReplyingTo(null)
      setReplyParentId(null)
      await refetch()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not post your reply. Please try again.'))
    } finally {
      setCommentActionPending(false)
    }
  }

  const {
    isSignedIn,
    canRate,
    reviews,
    reviewCount: listCount,
    isLoading,
    isError,
    refetch,
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
  const hydratedFormKey = useRef<string | null>(null)

  useEffect(() => {
    const formKey = JSON.stringify([productType, productId, currentUser?.id])
    if (isEligibilityLoading || hydratedFormKey.current === formKey) return
    hydratedFormKey.current = formKey
    reset(!isHub && myReview ? {
        rating: myReview.rating ?? 0,
        review_text: myReview.review_text,
      } : { rating: 0, review_text: '' })
  }, [myReview, productType, productId, currentUser?.id, isEligibilityLoading, isHub, reset])

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

    if (!isHub && canRate && parsed.data.rating === 0) {
      setError('rating', { type: 'manual', message: 'Select a rating' })
      return
    }

    submitReview(
      {
        rating: canRate ? parsed.data.rating || null : null,
        review_text: parsed.data.review_text?.trim() ?? '',
      },
      {
        onSuccess: () => {
          reset({ rating: 0, review_text: '' })
        },
      },
    )
  })

  const ratingNumber = Number(averageRating)
  const studioHandle = currentUser?.full_name?.trim() || 'Your account'

  const formPanel = (
    <div className="product-detail-reviews__form-panel">
      {isHub ? (
        currentUser?.avatar ? (
          <img
            className="product-detail-reviews__composer-avatar"
            src={currentUser.avatar}
            alt=""
          />
        ) : (
          <span className="product-detail-reviews__composer-avatar" aria-hidden="true">
            {authorInitials(currentUser?.full_name ?? 'Guest')}
          </span>
        )
      ) : null}
      <div className="product-detail-reviews__composer-content">
      {isHub ? (
        !isSignedIn ? (
          <AuthEntryButton
            mode="login"
            returnTo={location.pathname}
            className="product-detail-reviews__composer-trigger"
          >
            Add a comment...
          </AuthEntryButton>
        ) : isEligibilityLoading ? (
          <Spinner label="Checking review eligibility..." />
        ) : (
          <form className="product-detail-reviews__compact-form" onSubmit={onSubmit} noValidate>
            <label className="visually-hidden" htmlFor="review-text">
              Comment
            </label>
            <input
              id="review-text"
              className="product-detail-reviews__composer-trigger"
              type="text"
              maxLength={2000}
              placeholder="Add a comment..."
              aria-invalid={Boolean(errors.review_text)}
              disabled={isSubmitting}
              {...register('review_text')}
            />
            {errors.review_text?.message ? (
              <p id="review-text-error" className="form-field__error" role="alert">
                {errors.review_text.message}
              </p>
            ) : null}
          </form>
        )
      ) : !isSignedIn ? (
        <div className="product-detail-reviews__form product-detail-reviews__form--guest">
          <div className="form-field">
            <label className="visually-hidden" htmlFor="guest-review-text">
              Comment
            </label>
            <div className="product-detail-reviews__textarea-wrap">
              <textarea
                id="guest-review-text"
                className="auth-input product-detail-reviews__textarea"
                rows={5}
                maxLength={2000}
                placeholder="Write a comment or ask about Blender/Unreal compatibility…"
                {...register('review_text')}
              />
              <p className="product-detail-reviews__counter" aria-live="polite">
                {reviewText.length} / 2000
              </p>
            </div>
          </div>
          <AuthEntryButton
            mode="login"
            returnTo={location.pathname}
            className="ui-button ui-button--primary product-detail-reviews__submit"
            disabled={!reviewText.trim()}
          >
            Send
          </AuthEntryButton>
        </div>
      ) : isEligibilityLoading ? (
        <Spinner label="Checking review eligibility..." />
      ) : (
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
            label="Rating"
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
                  disabled={!canRate || isSubmitting}
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

          {!canRate ? <p className="product-detail-reviews__gate">You can post a comment. Star ratings are available to verified purchasers.</p> : null}

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
            disabled={
              isSubmitting || (!selectedRating && !reviewText.trim())
            }
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
      )}
      </div>
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
        <p className="product-detail-reviews__empty">No reviews or comments yet.</p>
      ) : (
        <ul className="product-detail-reviews__list">
          {reviews.map((review) => (
            <li key={review.id} className="product-detail-reviews__item">
              <div className="product-detail-reviews__item-header">
                {isHub ? (
                  review.author.avatar ? (
                    <img
                      className="product-detail-reviews__avatar"
                      src={review.author.avatar}
                      alt=""
                    />
                  ) : (
                    <span className="product-detail-reviews__avatar" aria-hidden="true">
                      {authorInitials(review.author.full_name)}
                    </span>
                  )
                ) : null}
                <div className="product-detail-reviews__item-meta">
                  <div className="product-detail-reviews__item-top">
                    <div className="product-detail-reviews__item-identity">
                      <strong>{review.author.full_name}</strong>
                    </div>
                    <time dateTime={review.created_at}>
                      {isHub ? formatRelative(review.created_at) : formatDate(review.created_at)}
                    </time>
                  </div>
                  {review.rating !== null ? (
                    <span
                      className="product-detail-reviews__item-stars"
                      aria-label={`${review.rating} out of 5 stars`}
                    >
                      {'★'.repeat(review.rating)}
                      <span className="product-detail-reviews__item-stars-empty" aria-hidden="true">
                        {'★'.repeat(5 - review.rating)}
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>
              {review.review_text.trim() ? (
                <p className="product-detail-reviews__item-body">{review.review_text}</p>
              ) : null}
              <div className="product-detail-reviews__actions" aria-label="Comment actions">
                {isSignedIn ? (
                  <>
                    <button
                      type="button"
                      className={`product-detail-reviews__action${review.viewer_reaction === 'like' ? ' product-detail-reviews__action--active' : ''}`}
                      onClick={() => void reactToComment(review.id, 'like')}
                      disabled={commentActionPending}
                      aria-label="Like comment"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M7 10v12" />
                        <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
                      </svg>
                      {(review.like_count ?? 0) > 0 ? review.like_count : null}
                    </button>
                    <button
                      type="button"
                      className={`product-detail-reviews__action${review.viewer_reaction === 'dislike' ? ' product-detail-reviews__action--active' : ''}`}
                      onClick={() => void reactToComment(review.id, 'dislike')}
                      disabled={commentActionPending}
                      aria-label="Dislike comment"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M17 14V2" />
                        <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
                      </svg>
                      {(review.dislike_count ?? 0) > 0 ? review.dislike_count : null}
                    </button>
                    <button
                      type="button"
                      className="product-detail-reviews__reply-button"
                      onClick={() => {
                        setReplyingTo((current) => current === review.id ? null : review.id)
                        setReplyParentId(null)
                        setReplyText('')
                      }}
                    >
                      Reply
                    </button>
                  </>
                ) : (
                  <AuthEntryButton mode="login" className="product-detail-reviews__reply-button">
                    Log in to reply
                  </AuthEntryButton>
                )}
              </div>
              {replyingTo === review.id ? (
                <form
                  className="product-detail-reviews__reply-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void postReply(review.id, replyParentId)
                  }}
                >
                  <input
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    maxLength={2000}
                    placeholder="Add a reply..."
                    aria-label="Reply"
                    autoFocus
                  />
                  <button type="button" onClick={() => { setReplyingTo(null); setReplyParentId(null) }}>Cancel</button>
                  <button type="submit" disabled={!replyText.trim() || commentActionPending}>Reply</button>
                </form>
              ) : null}
              {(review.replies ?? []).length > 0 ? (
                <ul className="product-detail-reviews__replies">
                  {(review.replies ?? []).map((reply) => (
                    <li
                      key={reply.id}
                      className={reply.parent_id ? 'product-detail-reviews__reply--nested' : undefined}
                    >
                      {reply.author.avatar ? (
                        <img className="product-detail-reviews__reply-avatar" src={reply.author.avatar} alt="" />
                      ) : (
                        <span className="product-detail-reviews__reply-avatar" aria-hidden="true">
                          {authorInitials(reply.author.full_name)}
                        </span>
                      )}
                      <div>
                        <div className="product-detail-reviews__reply-meta">
                          <strong>{reply.author.full_name}</strong>
                          <time dateTime={reply.created_at}>{formatRelative(reply.created_at)}</time>
                        </div>
                        <p>{reply.text}</p>
                        <div className="product-detail-reviews__reply-actions" aria-label="Reply actions">
                          {isSignedIn ? (
                            <>
                              <button
                                type="button"
                                className={`product-detail-reviews__action${reply.viewer_reaction === 'like' ? ' product-detail-reviews__action--active' : ''}`}
                                onClick={() => void reactToReply(reply.id, 'like')}
                                disabled={commentActionPending}
                                aria-label="Like reply"
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M7 10v12" />
                                  <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
                                </svg>
                                {(reply.like_count ?? 0) > 0 ? reply.like_count : null}
                              </button>
                              <button
                                type="button"
                                className={`product-detail-reviews__action${reply.viewer_reaction === 'dislike' ? ' product-detail-reviews__action--active' : ''}`}
                                onClick={() => void reactToReply(reply.id, 'dislike')}
                                disabled={commentActionPending}
                                aria-label="Dislike reply"
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M7.5 13.5 11 20.2c.4.8 1.5.9 2.1.2.4-.5.6-1.2.4-1.8l-.8-3h5.5c1.3 0 2.3 1.2 2 2.5l-1.5-7a2 2 0 0 0-2-1.6H7.5v9Z" />
                                  <path d="M17 14V2" />
                                  <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
                                </svg>
                                {(reply.dislike_count ?? 0) > 0 ? reply.dislike_count : null}
                              </button>
                              <button
                                type="button"
                                className="product-detail-reviews__reply-button"
                                onClick={() => {
                                  setReplyingTo((current) => current === reply.id ? null : reply.id)
                                  setReplyParentId(reply.id)
                                  setReplyText('')
                                }}
                              >
                                Reply
                              </button>
                            </>
                          ) : (
                            <AuthEntryButton mode="login" className="product-detail-reviews__reply-button">
                              Log in to reply
                            </AuthEntryButton>
                          )}
                        </div>
                        {replyingTo === reply.id ? (
                          <form
                            className="product-detail-reviews__reply-form product-detail-reviews__reply-form--nested"
                            onSubmit={(event) => {
                              event.preventDefault()
                              void postReply(review.id, reply.id)
                            }}
                          >
                            <input
                              value={replyText}
                              onChange={(event) => setReplyText(event.target.value)}
                              maxLength={2000}
                              placeholder={`Reply to ${reply.author.full_name}...`}
                              aria-label={`Reply to ${reply.author.full_name}`}
                              autoFocus
                            />
                            <button type="button" onClick={() => { setReplyingTo(null); setReplyParentId(null) }}>Cancel</button>
                            <button type="submit" disabled={!replyText.trim() || commentActionPending}>Reply</button>
                          </form>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        totalPages={Math.ceil(listCount / 10)}
        onPageChange={setPage}
        ariaLabel="Review pagination"
        className="product-detail-reviews__pagination"
      />
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
              Reviews &amp; Comments ({isLoading || isError ? reviewCount : listCount})
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
