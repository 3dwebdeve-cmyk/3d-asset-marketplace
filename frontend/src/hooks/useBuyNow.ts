import { useMutation, useQueryClient } from '@tanstack/react-query'

import { addCartItem, getCart } from '../api/cartApi'
import { createCheckoutSession } from '../api/paymentsApi'
import { getApiErrorMessage } from '../lib/apiError'
import { rememberCheckoutOrderId } from '../lib/checkoutReturn'
import { currentAcceptedLegalPayload } from '../lib/legalDocuments'
import type { LineKind } from '../lib/packages'
import { toast } from '../lib/toast'
import type { CartProductType } from '../types/cart'
import type { CheckoutItem } from '../types/payment'

interface BuyNowPayload {
  productType: CartProductType
  productId: string
  /** A model's packages (one line each); empty for a plugin. */
  packageKinds: LineKind[]
}

export function useBuyNow() {
  const queryClient = useQueryClient()

  const buyNowMutation = useMutation({
    mutationFn: async ({ productType, productId, packageKinds }: BuyNowPayload) => {
      const lines: CheckoutItem[] =
        productType === 'product'
          ? packageKinds.map((kind) => ({ product_type: productType, product_id: productId, package_kind: kind }))
          : [{ product_type: productType, product_id: productId }]
      const cart = await getCart()
      for (const line of lines) {
        const alreadyInCart = cart.items.some(
          (item) =>
            item.product_type === line.product_type &&
            item.product_id === line.product_id &&
            item.package_kind === (line.package_kind ?? ''),
        )
        if (!alreadyInCart) {
          await addCartItem({ ...line, quantity: 1 })
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['cart'] })
      // Buy Now pays for these lines only; the rest of the cart stays for later.
      return createCheckoutSession(currentAcceptedLegalPayload(), lines)
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
    /** Buy a plugin, or the given packages of a model, at once. */
    buyNow: (productType: CartProductType, productId: string, packageKinds: LineKind[] = []) => {
      buyNowMutation.mutate({ productType, productId, packageKinds })
    },
    isRedirecting: buyNowMutation.isPending || buyNowMutation.isSuccess,
  }
}
