import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useForm } from 'react-hook-form'

import { registerUser } from '../../api/authApi'
import { getApiErrorMessage } from '../../lib/apiError'
import type { ApiErrorResponse, RegisteredUser } from '../../types/auth'
import {
  defaultRegisterValues,
  registerSchema,
  type RegisterFormValues,
} from './registerSchema'

interface UseRegisterFormResult {
  register: ReturnType<typeof useForm<RegisterFormValues>>['register']
  handleSubmit: ReturnType<typeof useForm<RegisterFormValues>>['handleSubmit']
  watch: ReturnType<typeof useForm<RegisterFormValues>>['watch']
  errors: ReturnType<typeof useForm<RegisterFormValues>>['formState']['errors']
  isSubmitting: boolean
  serverError: string | null
  registeredUser: RegisteredUser | null
  onSubmit: (values: RegisterFormValues) => void
}

export function useRegisterForm(): UseRegisterFormResult {
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    defaultValues: defaultRegisterValues,
    mode: 'onBlur',
  })

  const mutation = useMutation({
    mutationFn: registerUser,
    onError: (error) => {
      if (!isAxiosError<ApiErrorResponse>(error) || !error.response?.data) {
        return
      }

      const data = error.response.data
      Object.entries(data).forEach(([field, value]) => {
        if (field === 'detail' || field === 'code' || !Array.isArray(value)) {
          return
        }

        if (field in defaultRegisterValues) {
          setError(field as keyof RegisterFormValues, {
            type: 'server',
            message: value[0],
          })
        }
      })
    },
  })

  const onSubmit = (values: RegisterFormValues) => {
    const parsed = registerSchema.safeParse(values)
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0]
        if (typeof field === 'string' && field in defaultRegisterValues) {
          setError(field as keyof RegisterFormValues, {
            type: 'manual',
            message: issue.message,
          })
        }
      })
      return
    }

    mutation.mutate({
      full_name: parsed.data.full_name,
      email: parsed.data.email,
      password: parsed.data.password,
      password_confirm: parsed.data.password_confirm,
      phone: parsed.data.phone?.trim() ?? '',
      country: parsed.data.country?.trim() ?? '',
    })
  }

  return {
    register,
    handleSubmit,
    watch,
    errors,
    isSubmitting: mutation.isPending,
    serverError: mutation.isError
      ? getApiErrorMessage(mutation.error, 'Registration failed. Please try again.')
      : null,
    registeredUser: mutation.isSuccess ? mutation.data : null,
    onSubmit,
  }
}
