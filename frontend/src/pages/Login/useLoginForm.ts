import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useForm } from 'react-hook-form'

import { loginUser } from '../../api/authApi'
import { toast } from '../../lib/toast'
import { useAuthStore } from '../../store/authStore'
import type { ApiErrorResponse, LoginResponse } from '../../types/auth'
import { defaultLoginValues, loginSchema, type LoginFormValues } from './loginSchema'

interface UseLoginFormResult {
  register: ReturnType<typeof useForm<LoginFormValues>>['register']
  handleSubmit: ReturnType<typeof useForm<LoginFormValues>>['handleSubmit']
  errors: ReturnType<typeof useForm<LoginFormValues>>['formState']['errors']
  isSubmitting: boolean
  serverError: string | null
  isSuccess: boolean
  onSubmit: (values: LoginFormValues) => void
}

function mapApiError(error: unknown): string {
  if (!isAxiosError<ApiErrorResponse>(error)) {
    return 'Sign in failed. Please try again.'
  }

  const data = error.response?.data
  if (!data) {
    return 'Sign in failed. Please try again.'
  }

  if (typeof data.detail === 'string') {
    return data.detail
  }

  const messages = Object.values(data).flatMap((value) => {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string')
    }
    if (typeof value === 'string') {
      return [value]
    }
    return []
  })

  return messages[0] ?? 'Invalid email or password.'
}

export function useLoginForm(): UseLoginFormResult {
  const queryClient = useQueryClient()
  const setSession = useAuthStore((state) => state.setSession)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginFormValues>({
    defaultValues: defaultLoginValues,
    mode: 'onBlur',
  })

  const mutation = useMutation({
    mutationFn: loginUser,
    onSuccess: (data: LoginResponse) => {
      setSession({ access: data.access, refresh: data.refresh, user: data.user })
      // Seed the me query so bootstrap/dashboard see a valid user immediately.
      queryClient.setQueryData(['auth', 'me', data.access], data.user)
      const firstName = data.user.full_name?.split(' ')[0]
      toast.success(firstName ? `Signed in. Welcome back, ${firstName}!` : 'Signed in')
    },
  })

  const onSubmit = (values: LoginFormValues) => {
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

    mutation.mutate({
      email: parsed.data.email,
      password: parsed.data.password,
    })
  }

  return {
    register,
    handleSubmit,
    errors,
    isSubmitting: mutation.isPending,
    serverError: mutation.isError ? mapApiError(mutation.error) : null,
    isSuccess: mutation.isSuccess,
    onSubmit,
  }
}
