import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'

import { loginUser } from '../../api/authApi'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import { useAuthStore } from '../../store/authStore'
import type { LoginResponse } from '../../types/auth'
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
    serverError: mutation.isError
      ? getApiErrorMessage(mutation.error, 'Invalid email or password.')
      : null,
    isSuccess: mutation.isSuccess,
    onSubmit,
  }
}
