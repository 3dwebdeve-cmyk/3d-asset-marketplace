export type ReviewProductType = 'product' | 'plugin'

export interface ReviewAuthor {
  id: string
  full_name: string
  avatar?: string
}

export interface Review {
  id: string
  product_type: ReviewProductType
  product_id: string
  rating: number | null
  review_text: string
  author: ReviewAuthor
  created_at: string
  updated_at: string
}

export interface ReviewEligibility {
  can_review: boolean
  can_rate?: boolean
  has_reviewed: boolean
  review: Review | null
}

export interface ReviewCreatePayload {
  product_type: ReviewProductType
  product_id: string
  rating?: number | null
  review_text?: string
}

export interface PaginatedReviews {
  count: number
  next: string | null
  previous: string | null
  results: Review[]
}

export interface ReviewListParams {
  product_type: ReviewProductType
  product_id: string
  ordering?: 'created_at' | '-created_at' | 'rating' | '-rating'
  page?: number
  page_size?: number
}

export interface AdminReviewCatalog {
  name: string
  slug: string
}

export interface AdminReview {
  id: string
  product_type: ReviewProductType
  product_id: string
  rating: number | null
  review_text: string
  is_hidden: boolean
  author: ReviewAuthor
  author_email: string
  catalog: AdminReviewCatalog | null
  created_at: string
  updated_at: string
}

export interface PaginatedAdminReviews {
  count: number
  next: string | null
  previous: string | null
  results: AdminReview[]
}

export interface AdminReviewListParams {
  product_type?: ReviewProductType
  product_id?: string
  is_hidden?: boolean
  search?: string
  ordering?: string
  page?: number
  page_size?: number
}
