import { useMutation } from '@tanstack/react-query'

import { createCheckoutSession } from '../api/paymentsApi'
import { getApiErrorMessage } from '../lib/apiError'
import { rememberCheckoutOrderId } from '../lib/checkoutReturn'
import { toast } from '../lib/toast'

export function useCheckout() {
  const checkoutMutation = useMutation({
    mutationFn: createCheckoutSession,
    onSuccess: (data) => {
      rememberCheckoutOrderId(data.order_id)
      window.location.href = data.checkout_url
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Could not start checkout. Please try again.'))
    },
  })

  return {
    startCheckout: () => checkoutMutation.mutate(),
    isRedirecting: checkoutMutation.isPending || checkoutMutation.isSuccess,
  }
}
