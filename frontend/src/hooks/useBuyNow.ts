import { useMutation, useQueryClient } from '@tanstack/react-query'

import { addCartItem, getCart } from '../api/cartApi'
import { createCheckoutSession } from '../api/paymentsApi'
import { getApiErrorMessage } from '../lib/apiError'
import { rememberCheckoutOrderId } from '../lib/checkoutReturn'
import { currentAcceptedLegalPayload } from '../lib/legalDocuments'
import { toast } from '../lib/toast'
import type { CartProductType } from '../types/cart'

interface BuyNowPayload {
  productType: CartProductType
  productId: string
}

export function useBuyNow() {
  const queryClient = useQueryClient()

  const buyNowMutation = useMutation({
    mutationFn: async ({ productType, productId }: BuyNowPayload) => {
      const cart = await getCart()
      const alreadyInCart = cart.items.some(
        (item) => item.product_type === productType && item.product_id === productId,
      )
      if (!alreadyInCart) {
        await addCartItem({
          product_type: productType,
          product_id: productId,
          quantity: 1,
        })
      }
      await queryClient.invalidateQueries({ queryKey: ['cart'] })
      return createCheckoutSession(currentAcceptedLegalPayload())
    },
    onSuccess: (data) => {
      rememberCheckoutOrderId(data.order_id)
      window.location.href = data.checkout_url
    },
    onError: (error) => {
      toast.error(
        getApiErrorMessage(error, 'Could not start checkout. Please try again.'),
      )
    },
  })

  return {
    buyNow: (productType: CartProductType, productId: string) => {
      buyNowMutation.mutate({ productType, productId })
    },
    isRedirecting: buyNowMutation.isPending || buyNowMutation.isSuccess,
  }
}
