import { apiClient } from './client'
import type {
  AdminReview,
  AdminReviewListParams,
  PaginatedAdminReviews,
  PaginatedReviews,
  Review,
  ReviewCreatePayload,
  ReviewEligibility,
  ReviewListParams,
  ReviewProductType,
  ReviewReactionResult,
  ReviewReactionValue,
  ReviewReply,
} from '../types/review'

function toListQuery(params: ReviewListParams): string {
  const query = new URLSearchParams()
  query.set('product_type', params.product_type)
  query.set('product_id', params.product_id)
  if (params.ordering) query.set('ordering', params.ordering)
  if (params.page) query.set('page', String(params.page))
  if (params.page_size) query.set('page_size', String(params.page_size))
  return `?${query.toString()}`
}

function toAdminQuery(params: AdminReviewListParams = {}): string {
  const query = new URLSearchParams()
  if (params.product_type) query.set('product_type', params.product_type)
  if (params.product_id) query.set('product_id', params.product_id)
  if (params.is_hidden !== undefined) query.set('is_hidden', String(params.is_hidden))
  if (params.search) query.set('search', params.search)
  if (params.ordering) query.set('ordering', params.ordering)
  if (params.page) query.set('page', String(params.page))
  if (params.page_size) query.set('page_size', String(params.page_size))
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

export async function listReviews(params: ReviewListParams): Promise<PaginatedReviews> {
  const { data } = await apiClient.get<PaginatedReviews>(`/api/v1/reviews/${toListQuery(params)}`)
  return data
}

export async function createReview(payload: ReviewCreatePayload): Promise<Review> {
  const { data } = await apiClient.post<Review>('/api/v1/reviews/', payload)
  return data
}

export async function createReviewReply(
  reviewId: string,
  text: string,
  parentId?: string | null,
): Promise<ReviewReply> {
  const { data } = await apiClient.post<ReviewReply>(`/api/v1/reviews/${reviewId}/replies/`, {
    text,
    parent_id: parentId ?? null,
  })
  return data
}

export async function toggleReviewReaction(
  reviewId: string,
  value: ReviewReactionValue,
): Promise<ReviewReactionResult> {
  const { data } = await apiClient.post<ReviewReactionResult>(
    `/api/v1/reviews/${reviewId}/reaction/`,
    { value },
  )
  return data
}

export async function toggleReviewReplyReaction(
  replyId: string,
  value: ReviewReactionValue,
): Promise<ReviewReactionResult> {
  const { data } = await apiClient.post<ReviewReactionResult>(
    `/api/v1/reviews/replies/${replyId}/reaction/`,
    { value },
  )
  return data
}

export async function getReviewEligibility(
  productType: ReviewProductType,
  productId: string,
): Promise<ReviewEligibility> {
  const query = new URLSearchParams({
    product_type: productType,
    product_id: productId,
  })
  const { data } = await apiClient.get<ReviewEligibility>(
    `/api/v1/reviews/eligibility/?${query.toString()}`,
  )
  return data
}

export async function listAdminReviews(
  params: AdminReviewListParams = {},
): Promise<PaginatedAdminReviews> {
  const { data } = await apiClient.get<PaginatedAdminReviews>(
    `/api/v1/admin/reviews/${toAdminQuery(params)}`,
  )
  return data
}

export async function updateAdminReviewHidden(
  reviewId: string,
  isHidden: boolean,
): Promise<AdminReview> {
  const { data } = await apiClient.patch<AdminReview>(`/api/v1/admin/reviews/${reviewId}/`, {
    is_hidden: isHidden,
  })
  return data
}

export async function deleteAdminReview(reviewId: string): Promise<void> {
  await apiClient.delete(`/api/v1/admin/reviews/${reviewId}/`)
}
