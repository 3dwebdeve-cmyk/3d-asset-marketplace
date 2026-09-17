import { useMutation, useQueryClient } from '@tanstack/react-query'

import { loginWithGoogle } from '../api/authApi'
import { getApiErrorMessage } from '../lib/apiError'
import { toast } from '../lib/toast'
import { useAuthStore } from '../store/authStore'
import type { LoginResponse } from '../types/auth'

interface UseGoogleLoginResult {
  isSubmitting: boolean
  serverError: string | null
  isSuccess: boolean
  signInWithGoogle: (idToken: string) => void
}

export function useGoogleLogin(): UseGoogleLoginResult {
  const queryClient = useQueryClient()
  const setSession = useAuthStore((state) => state.setSession)

  const mutation = useMutation({
    mutationFn: (idToken: string) => loginWithGoogle(idToken),
    onSuccess: (data: LoginResponse) => {
      setSession({ access: data.access, user: data.user }, { remember: true })
      queryClient.setQueryData(['auth', 'me', data.access], data.user)
      const firstName = data.user.full_name?.split(' ')[0]
      toast.success(firstName ? `Signed in. Welcome, ${firstName}!` : 'Signed in with Google')
    },
  })

  return {
    isSubmitting: mutation.isPending,
    serverError: mutation.isError
      ? getApiErrorMessage(mutation.error, 'Google sign-in failed.')
      : null,
    isSuccess: mutation.isSuccess,
    signInWithGoogle: (idToken: string) => {
      mutation.mutate(idToken)
    },
  }
}
