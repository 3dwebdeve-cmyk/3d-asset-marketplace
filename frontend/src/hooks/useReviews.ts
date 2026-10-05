import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createReview,
  getReviewEligibility,
  listReviews,
} from '../api/reviewsApi'
import { getApiErrorMessage } from '../lib/apiError'
import { toast } from '../lib/toast'
import { useAuthStore } from '../store/authStore'
import type { ReviewCreatePayload, ReviewProductType } from '../types/review'

export type ReviewOrdering = 'created_at' | '-created_at' | 'rating' | '-rating'

interface UseReviewsOptions {
  productType: ReviewProductType
  productId: string
  catalogSlug?: string
  page?: number
  pageSize?: number
  ordering?: ReviewOrdering
}

export function useReviews({
  productType,
  productId,
  catalogSlug,
  page = 1,
  pageSize = 10,
  ordering = '-created_at',
}: UseReviewsOptions) {
  const queryClient = useQueryClient()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const accessToken = useAuthStore((state) => state.accessToken)
  const userId = useAuthStore((state) => state.user?.id)
  const isSignedIn = isAuthenticated && Boolean(accessToken)

  const listQuery = useQuery({
    queryKey: ['reviews', productType, productId, page, pageSize, ordering],
    queryFn: () =>
      listReviews({
        product_type: productType,
        product_id: productId,
        page,
        page_size: pageSize,
        ordering,
      }),
    enabled: Boolean(productId),
  })

  const eligibilityQuery = useQuery({
    queryKey: ['reviews', 'eligibility', productType, productId, userId],
    queryFn: () => getReviewEligibility(productType, productId),
    enabled: isSignedIn && Boolean(productId),
  })

  const submitMutation = useMutation({
    mutationFn: (payload: Omit<ReviewCreatePayload, 'product_type' | 'product_id'>) =>
      createReview({
        product_type: productType,
        product_id: productId,
        rating: payload.rating ?? null,
        review_text: payload.review_text,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reviews', productType, productId] }),
        queryClient.invalidateQueries({
          queryKey: ['reviews', 'eligibility', productType, productId],
        }),
        catalogSlug
          ? queryClient.invalidateQueries({
              queryKey:
                productType === 'product'
                  ? ['public-product-detail', catalogSlug]
                  : ['public-plugin-detail', catalogSlug],
            })
          : Promise.resolve(),
        queryClient.invalidateQueries({
          queryKey: productType === 'product' ? ['public-products'] : ['public-plugins'],
        }),
      ])
      toast.success('Review saved.')
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Could not save your review.'))
    },
  })

  return {
    isSignedIn,
    reviews: listQuery.data?.results ?? [],
    reviewCount: listQuery.data?.count ?? 0,
    hasNextPage: Boolean(listQuery.data?.next),
    hasPreviousPage: Boolean(listQuery.data?.previous),
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    refetch: listQuery.refetch,
    canReview: isSignedIn,
    hasReviewed: eligibilityQuery.data?.has_reviewed ?? false,
    myReview: isSignedIn ? eligibilityQuery.data?.review ?? null : null,
    isEligibilityLoading: eligibilityQuery.isLoading,
    submitReview: submitMutation.mutate,
    isSubmitting: submitMutation.isPending,
  }
}
