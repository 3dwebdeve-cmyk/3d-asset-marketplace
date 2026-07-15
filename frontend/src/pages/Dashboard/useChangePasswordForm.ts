import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useForm } from 'react-hook-form'

import { changePassword } from '../../api/authApi'
import { toast } from '../../lib/toast'
import type { ApiErrorResponse } from '../../types/auth'
import {
  changePasswordSchema,
  defaultChangePasswordValues,
  type ChangePasswordFormValues,
} from './changePasswordSchema'

interface UseChangePasswordFormOptions {
  onSuccess?: () => void
}

interface UseChangePasswordFormResult {
  register: ReturnType<typeof useForm<ChangePasswordFormValues>>['register']
  handleSubmit: ReturnType<typeof useForm<ChangePasswordFormValues>>['handleSubmit']
  errors: ReturnType<typeof useForm<ChangePasswordFormValues>>['formState']['errors']
  isSubmitting: boolean
  serverError: string | null
  onSubmit: (values: ChangePasswordFormValues) => void
}

function mapApiError(error: unknown): string {
  if (!isAxiosError<ApiErrorResponse>(error)) {
    return 'Could not change your password. Please try again.'
  }

  const data = error.response?.data
  if (!data) {
    return 'Could not change your password. Please try again.'
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

  return messages[0] ?? 'Could not change your password. Please check your details.'
}

export function useChangePasswordForm(
  options: UseChangePasswordFormOptions = {},
): UseChangePasswordFormResult {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({
    defaultValues: defaultChangePasswordValues,
    mode: 'onBlur',
  })

  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      reset(defaultChangePasswordValues)
      toast.success('Password updated')
      options.onSuccess?.()
    },
    onError: (error) => {
      if (!isAxiosError<ApiErrorResponse>(error) || !error.response?.data) {
        return
      }

      const data = error.response.data
      Object.entries(data).forEach(([field, value]) => {
        if (field === 'detail' || !Array.isArray(value)) {
          return
        }

        if (field in defaultChangePasswordValues) {
          setError(field as keyof ChangePasswordFormValues, {
            type: 'server',
            message: value[0],
          })
        }
      })
    },
  })

  const onSubmit = (values: ChangePasswordFormValues) => {
    const parsed = changePasswordSchema.safeParse(values)
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0]
        if (typeof field === 'string' && field in defaultChangePasswordValues) {
          setError(field as keyof ChangePasswordFormValues, {
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
    serverError: mutation.isError ? mapApiError(mutation.error) : null,
    onSubmit,
  }
}
