import { useEffect, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'

import { confirmEmailVerification } from '../../api/authApi'
import { getApiErrorMessage } from '../../lib/apiError'

interface UseEmailVerificationResult {
  isVerifying: boolean
  serverError: string | null
  successMessage: string | null
}

export function useEmailVerification(uid: string, token: string): UseEmailVerificationResult {
  const hasAttempted = useRef(false)

  const mutation = useMutation({
    mutationFn: confirmEmailVerification,
  })
  const { mutate } = mutation

  useEffect(() => {
    if (!uid || !token || hasAttempted.current) {
      return
    }

    hasAttempted.current = true
    mutate({ uid, token })
  }, [mutate, token, uid])

  return {
    isVerifying: mutation.isPending,
    serverError: mutation.isError
      ? getApiErrorMessage(mutation.error, 'Could not verify your email. Please try again.')
      : null,
    successMessage: mutation.isSuccess ? (mutation.data?.detail ?? 'Email verified.') : null,
  }
}
