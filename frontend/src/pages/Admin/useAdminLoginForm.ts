import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'

import { adminLoginUser } from '../../api/authApi'
import { getApiErrorMessage } from '../../lib/apiError'
import { useAuthStore } from '../../store/authStore'
import { isAdminMfaChallenge, type AdminLoginResponse, type LoginResponse } from '../../types/auth'
import {
  defaultLoginValues,
  loginSchema,
  type LoginFormValues,
} from '../Login/loginSchema'

/** Password accepted; waiting for the authenticator code (or its first-time setup). */
export interface AdminMfaPending {
  mfaToken: string
  setupRequired: boolean
  remember: boolean
}

interface UseAdminLoginFormResult {
  register: ReturnType<typeof useForm<LoginFormValues>>['register']
  handleSubmit: ReturnType<typeof useForm<LoginFormValues>>['handleSubmit']
  errors: ReturnType<typeof useForm<LoginFormValues>>['formState']['errors']
  isSubmitting: boolean
  serverError: string | null
  isSuccess: boolean
  onSubmit: (values: LoginFormValues) => void
  mfaPending: AdminMfaPending | null
  completeSignIn: (data: LoginResponse, remember: boolean) => void
  restartSignIn: (message?: string) => void
}

export function useAdminLoginForm(): UseAdminLoginFormResult {
  const queryClient = useQueryClient()
  const setSession = useAuthStore((state) => state.setSession)
  const [mfaPending, setMfaPending] = useState<AdminMfaPending | null>(null)
  const [isComplete, setIsComplete] = useState(false)
  const [restartMessage, setRestartMessage] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginFormValues>({
    defaultValues: defaultLoginValues,
    mode: 'onBlur',
  })

  const completeSignIn = useCallback(
    (data: LoginResponse, remember: boolean) => {
      // Respect the administrator's choice; a shared computer should not keep the session.
      setSession({ access: data.access, user: data.user }, { remember })
      queryClient.setQueryData(['auth', 'me', data.access], data.user)
      queryClient.setQueryData(['auth', 'admin', 'me', data.access], data.user)
      setMfaPending(null)
      setIsComplete(true)
    },
    [queryClient, setSession],
  )

  const mutation = useMutation({
    mutationFn: (values: LoginFormValues) =>
      adminLoginUser({
        email: values.email,
        password: values.password,
        remember_me: values.remember_me,
      }),
    onSuccess: (data: AdminLoginResponse, variables: LoginFormValues) => {
      if (isAdminMfaChallenge(data)) {
        setMfaPending({
          mfaToken: data.mfa_token,
          setupRequired: data.setup_required,
          remember: Boolean(variables.remember_me),
        })
        return
      }
      completeSignIn(data, Boolean(variables.remember_me))
    },
  })

  const restartSignIn = useCallback(
    (message?: string) => {
      setMfaPending(null)
      setRestartMessage(message ?? null)
      mutation.reset()
    },
    [mutation],
  )

  const onSubmit = (values: LoginFormValues) => {
    setRestartMessage(null)
    const parsed = loginSchema.safeParse(values)
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0]
        if (typeof field === 'string' && field in defaultLoginValues) {
          setError(field as keyof LoginFormValues, {
            type: 'manual',
            message: issue.message,
          })
        }
      })
      return
    }

    mutation.mutate(parsed.data)
  }

  return {
    register,
    handleSubmit,
    errors,
    isSubmitting: mutation.isPending,
    serverError: mutation.isError
      ? getApiErrorMessage(mutation.error, 'Invalid email or password.')
      : restartMessage,
    isSuccess: isComplete,
    onSubmit,
    mfaPending,
    completeSignIn,
    restartSignIn,
  }
}
