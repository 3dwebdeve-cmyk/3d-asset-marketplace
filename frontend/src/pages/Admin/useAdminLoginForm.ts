import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'

import { adminLoginUser } from '../../api/authApi'
import { getApiErrorMessage } from '../../lib/apiError'
import { useAuthStore } from '../../store/authStore'
import type { LoginResponse } from '../../types/auth'
import {
  defaultLoginValues,
  loginSchema,
  type LoginFormValues,
} from '../Login/loginSchema'

interface UseAdminLoginFormResult {
  register: ReturnType<typeof useForm<LoginFormValues>>['register']
  handleSubmit: ReturnType<typeof useForm<LoginFormValues>>['handleSubmit']
  errors: ReturnType<typeof useForm<LoginFormValues>>['formState']['errors']
  isSubmitting: boolean
  serverError: string | null
  isSuccess: boolean
  onSubmit: (values: LoginFormValues) => void
}

export function useAdminLoginForm(): UseAdminLoginFormResult {
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
    mutationFn: (values: LoginFormValues) =>
      adminLoginUser({
        email: values.email,
        password: values.password,
        remember_me: values.remember_me,
      }),
    onSuccess: (data: LoginResponse, variables: LoginFormValues) => {
      // Respect the administrator's choice; a shared computer should not keep the session.
      setSession(
        { access: data.access, user: data.user },
        { remember: variables.remember_me },
      )
      queryClient.setQueryData(['auth', 'me', data.access], data.user)
      queryClient.setQueryData(['auth', 'admin', 'me', data.access], data.user)
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
    isSuccess: mutation.isSuccess,
    onSubmit,
  }
}
