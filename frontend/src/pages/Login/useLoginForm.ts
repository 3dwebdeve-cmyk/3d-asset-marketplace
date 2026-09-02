import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useForm } from 'react-hook-form'

import { loginUser } from '../../api/authApi'
import { getApiErrorMessage } from '../../lib/apiError'
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
  emailNotVerified: boolean
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
    mutationFn: async (values: LoginFormValues) => {
      const data = await loginUser({
        email: values.email,
        password: values.password,
      })
      return { data, remember: values.remember_me }
    },
    onSuccess: ({ data, remember }: { data: LoginResponse; remember: boolean }) => {
      setSession({ access: data.access, refresh: data.refresh, user: data.user }, { remember })
      queryClient.setQueryData(['auth', 'me', data.access], data.user)
      if (data.user.role === 'Administrator') {
        queryClient.setQueryData(['auth', 'admin', 'me', data.access], data.user)
      }
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

    mutation.mutate(parsed.data)
  }

  return {
    register,
    handleSubmit,
    errors,
    isSubmitting: mutation.isPending,
    serverError: mutation.isError
      ? getApiErrorMessage(mutation.error, 'Invalid email or password.')
      : null,
    emailNotVerified:
      mutation.isError &&
      isAxiosError<ApiErrorResponse>(mutation.error) &&
      mutation.error.response?.data?.code === 'email_not_verified',
    isSuccess: mutation.isSuccess,
    onSubmit,
  }
}
