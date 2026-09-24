import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

import { addWishlistItem, listWishlistItems, removeWishlistItem } from '../api/wishlistApi'
import { getApiErrorMessage } from '../lib/apiError'
import { toast } from '../lib/toast'
import { useAuthStore } from '../store/authStore'
import type { WishlistProductType } from '../types/wishlist'

const LOOKUP_PAGE_SIZE = 100

function wishlistKey(type: WishlistProductType, id: string): string {
  return `${type}:${id}`
}

async function fetchAllWishlistLookupEntries(): Promise<Map<string, string>> {
  const lookup = new Map<string, string>()
  let page = 1

  while (true) {
    const response = await listWishlistItems({ page, page_size: LOOKUP_PAGE_SIZE })
    for (const item of response.results) {
      lookup.set(wishlistKey(item.product_type, item.product_id), item.id)
    }
    if (!response.next) {
      break
    }
    page += 1
  }

  return lookup
}

export function useWishlist() {
  const queryClient = useQueryClient()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const accessToken = useAuthStore((state) => state.accessToken)
  const isSignedIn = isAuthenticated && Boolean(accessToken)

  const countQuery = useQuery({
    queryKey: ['wishlist', 'count'],
    queryFn: () => listWishlistItems({ page: 1, page_size: 1 }),
    enabled: isSignedIn,
    select: (data) => data.count,
  })

  const lookupQuery = useQuery({
    queryKey: ['wishlist', 'lookup'],
    queryFn: fetchAllWishlistLookupEntries,
    enabled: isSignedIn,
  })

  const invalidateWishlist = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['wishlist', 'count'] }),
      queryClient.invalidateQueries({ queryKey: ['wishlist', 'lookup'] }),
      queryClient.invalidateQueries({ queryKey: ['wishlist', 'page'] }),
    ])
  }, [queryClient])

  const addMutation = useMutation({
    mutationFn: addWishlistItem,
    onSuccess: async () => {
      await invalidateWishlist()
      toast.success('Added to wishlist.')
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Could not add to wishlist.'))
    },
  })

  const removeMutation = useMutation({
    mutationFn: removeWishlistItem,
    onSuccess: async () => {
      await invalidateWishlist()
      toast.success('Removed from wishlist.')
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Could not remove from wishlist.'))
    },
  })

  const lookup = useMemo(() => lookupQuery.data ?? new Map<string, string>(), [lookupQuery.data])

  const isWishlisted = useCallback(
    (productType: WishlistProductType, productId: string) =>
      lookup.has(wishlistKey(productType, productId)),
    [lookup],
  )

  const toggle = useCallback(
    (productType: WishlistProductType, productId: string) => {
      if (!isSignedIn) {
        return
      }

      const itemId = lookup.get(wishlistKey(productType, productId))
      if (itemId) {
        removeMutation.mutate(itemId)
        return
      }

      addMutation.mutate({ product_type: productType, product_id: productId })
    },
    [addMutation, isSignedIn, lookup, removeMutation],
  )

  const isPending = addMutation.isPending || removeMutation.isPending

  return {
    count: countQuery.data ?? 0,
    isWishlisted,
    toggle,
    isLoading: countQuery.isLoading || lookupQuery.isLoading,
    isPending,
    isSignedIn,
  }
}
