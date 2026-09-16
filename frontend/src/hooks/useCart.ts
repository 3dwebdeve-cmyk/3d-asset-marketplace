import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

import {
  addCartItem,
  applyCartCoupon,
  clearCart,
  getCart,
  removeCartCoupon,
  removeCartItem,
  updateCartItemQuantity,
} from '../api/cartApi'
import { getApiErrorMessage } from '../lib/apiError'
import { toast } from '../lib/toast'
import { useAuthStore } from '../store/authStore'
import type { CartProductType } from '../types/cart'

function cartKey(type: CartProductType, id: string): string {
  return `${type}:${id}`
}

export function useCart() {
  const queryClient = useQueryClient()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const accessToken = useAuthStore((state) => state.accessToken)
  const isSignedIn = isAuthenticated && Boolean(accessToken)

  const cartQuery = useQuery({
    queryKey: ['cart'],
    queryFn: getCart,
    enabled: isSignedIn,
  })

  const invalidateCart = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['cart'] })
  }, [queryClient])

  const addMutation = useMutation({
    mutationFn: addCartItem,
    onSuccess: async () => {
      await invalidateCart()
      toast.success('Added to cart.')
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Could not add to cart.'))
    },
  })

  const updateQuantityMutation = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      updateCartItemQuantity(itemId, { quantity }),
    onSuccess: async () => {
      await invalidateCart()
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Could not update cart quantity.'))
    },
  })

  const removeMutation = useMutation({
    mutationFn: removeCartItem,
    onSuccess: async () => {
      await invalidateCart()
      toast.success('Removed from cart.')
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Could not remove from cart.'))
    },
  })

  const clearMutation = useMutation({
    mutationFn: clearCart,
    onSuccess: async () => {
      await invalidateCart()
      toast.success('Cart cleared.')
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Could not clear cart.'))
    },
  })

  const applyCouponMutation = useMutation({
    mutationFn: (code: string) => applyCartCoupon({ code }),
    onSuccess: async (cart) => {
      queryClient.setQueryData(['cart'], cart)
      toast.success('Coupon applied.')
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Could not apply coupon.'))
    },
  })

  const removeCouponMutation = useMutation({
    mutationFn: removeCartCoupon,
    onSuccess: async (cart) => {
      queryClient.setQueryData(['cart'], cart)
      toast.success('Coupon removed.')
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Could not remove coupon.'))
    },
  })

  const lookup = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of cartQuery.data?.items ?? []) {
      map.set(cartKey(item.product_type, item.product_id), item.id)
    }
    return map
  }, [cartQuery.data?.items])

  const isInCart = useCallback(
    (productType: CartProductType, productId: string) =>
      lookup.has(cartKey(productType, productId)),
    [lookup],
  )

  const add = useCallback(
    (productType: CartProductType, productId: string, quantity = 1) => {
      if (!isSignedIn) {
        return
      }
      addMutation.mutate({ product_type: productType, product_id: productId, quantity })
    },
    [addMutation, isSignedIn],
  )

  const updateQuantity = useCallback(
    (itemId: string, quantity: number) => {
      if (!isSignedIn) {
        return
      }
      updateQuantityMutation.mutate({ itemId, quantity })
    },
    [isSignedIn, updateQuantityMutation],
  )

  const remove = useCallback(
    (itemId: string) => {
      if (!isSignedIn) {
        return
      }
      removeMutation.mutate(itemId)
    },
    [isSignedIn, removeMutation],
  )

  const clear = useCallback(() => {
    if (!isSignedIn) {
      return
    }
    clearMutation.mutate()
  }, [clearMutation, isSignedIn])

  const applyCoupon = useCallback(
    (code: string) => {
      if (!isSignedIn) {
        return
      }
      applyCouponMutation.mutate(code)
    },
    [applyCouponMutation, isSignedIn],
  )

  const removeCoupon = useCallback(() => {
    if (!isSignedIn) {
      return
    }
    removeCouponMutation.mutate()
  }, [isSignedIn, removeCouponMutation])

  const isPending =
    addMutation.isPending ||
    updateQuantityMutation.isPending ||
    removeMutation.isPending ||
    clearMutation.isPending ||
    applyCouponMutation.isPending ||
    removeCouponMutation.isPending

  return {
    cart: cartQuery.data,
    count: cartQuery.data?.total_quantity ?? 0,
    isInCart,
    add,
    updateQuantity,
    remove,
    clear,
    applyCoupon,
    removeCoupon,
    isLoading: cartQuery.isLoading,
    isPending,
    isSignedIn,
    isError: cartQuery.isError,
    error: cartQuery.error,
    refetch: cartQuery.refetch,
    couponError: applyCouponMutation.error
      ? getApiErrorMessage(applyCouponMutation.error, 'Could not apply coupon.')
      : null,
    clearCouponError: applyCouponMutation.reset,
  }
}
