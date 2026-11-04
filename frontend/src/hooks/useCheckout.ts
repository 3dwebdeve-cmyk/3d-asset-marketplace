import { useMutation } from '@tanstack/react-query'

import { createCheckoutSession } from '../api/paymentsApi'
import { getApiErrorMessage } from '../lib/apiError'
import { rememberCheckoutOrderId } from '../lib/checkoutReturn'
import { currentAcceptedLegalPayload } from '../lib/legalDocuments'
import { toast } from '../lib/toast'
import type { CheckoutItem } from '../types/payment'

export function useCheckout() {
  const checkoutMutation = useMutation({
    // Avoid passing createCheckoutSession as mutationFn — its arg becomes required by RQ.
    mutationFn: (items?: CheckoutItem[]) => createCheckoutSession(currentAcceptedLegalPayload(), items),
    onSuccess: (data) => {
      rememberCheckoutOrderId(data.order_id)
      window.location.href = data.checkout_url
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Could not start checkout. Please try again.'))
    },
  })

  return {
    /** Buy the given cart lines, or the whole cart. */
    startCheckout: (items?: CheckoutItem[]) => checkoutMutation.mutate(items),
    isRedirecting: checkoutMutation.isPending || checkoutMutation.isSuccess,
  }
}
