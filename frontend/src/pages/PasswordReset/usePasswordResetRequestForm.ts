import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'

import { requestPasswordReset } from '../../api/authApi'
import { getApiErrorMessage } from '../../lib/apiError'
import {
  defaultPasswordResetRequestValues,
  passwordResetRequestSchema,
  type PasswordResetRequestFormValues,
} from './passwordResetRequestSchema'

interface UsePasswordResetRequestFormResult {
  register: ReturnType<typeof useForm<PasswordResetRequestFormValues>>['register']
  handleSubmit: ReturnType<typeof useForm<PasswordResetRequestFormValues>>['handleSubmit']
  errors: ReturnType<typeof useForm<PasswordResetRequestFormValues>>['formState']['errors']
  isSubmitting: boolean
  serverError: string | null
  successMessage: string | null
  onSubmit: (values: PasswordResetRequestFormValues) => void
}

export function usePasswordResetRequestForm(): UsePasswordResetRequestFormResult {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PasswordResetRequestFormValues>({
    defaultValues: defaultPasswordResetRequestValues,
    mode: 'onBlur',
  })

  const mutation = useMutation({
    mutationFn: requestPasswordReset,
  })

  const onSubmit = (values: PasswordResetRequestFormValues) => {
    const parsed = passwordResetRequestSchema.safeParse(values)
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0]
        if (typeof field === 'string' && field in defaultPasswordResetRequestValues) {
          setError(field as keyof PasswordResetRequestFormValues, {
            type: 'manual',
            message: issue.message,
          })
        }
      })
      return
    }
    mutation.mutate({ email: parsed.data.email })
  }

  return {
    register,
    handleSubmit,
    errors,
    isSubmitting: mutation.isPending,
    serverError: mutation.isError
      ? getApiErrorMessage(mutation.error, 'Could not send reset email. Please try again.')
      : null,
    successMessage: mutation.isSuccess ? (mutation.data?.detail ?? 'Check your email.') : null,
    onSubmit,
  }
}
