import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'

import { confirmPasswordReset } from '../../api/authApi'
import { getApiErrorMessage } from '../../lib/apiError'
import {
  defaultPasswordResetConfirmValues,
  passwordResetConfirmSchema,
  type PasswordResetConfirmFormValues,
} from './passwordResetConfirmSchema'

interface UsePasswordResetConfirmFormResult {
  register: ReturnType<typeof useForm<PasswordResetConfirmFormValues>>['register']
  handleSubmit: ReturnType<typeof useForm<PasswordResetConfirmFormValues>>['handleSubmit']
  errors: ReturnType<typeof useForm<PasswordResetConfirmFormValues>>['formState']['errors']
  isSubmitting: boolean
  serverError: string | null
  successMessage: string | null
  onSubmit: (values: PasswordResetConfirmFormValues) => void
}

export function usePasswordResetConfirmForm(
  uid: string,
  token: string,
): UsePasswordResetConfirmFormResult {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PasswordResetConfirmFormValues>({
    defaultValues: defaultPasswordResetConfirmValues,
    mode: 'onBlur',
  })

  const mutation = useMutation({
    mutationFn: confirmPasswordReset,
  })

  const onSubmit = (values: PasswordResetConfirmFormValues) => {
    const parsed = passwordResetConfirmSchema.safeParse(values)
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0]
        if (typeof field === 'string' && field in defaultPasswordResetConfirmValues) {
          setError(field as keyof PasswordResetConfirmFormValues, {
            type: 'manual',
            message: issue.message,
          })
        }
      })
      return
    }

    mutation.mutate({
      uid,
      token,
      new_password: parsed.data.new_password,
      new_password_confirm: parsed.data.new_password_confirm,
    })
  }

  return {
    register,
    handleSubmit,
    errors,
    isSubmitting: mutation.isPending,
    serverError: mutation.isError
      ? getApiErrorMessage(mutation.error, 'Could not reset your password. Please try again.')
      : null,
    successMessage: mutation.isSuccess ? (mutation.data?.detail ?? 'Password reset.') : null,
    onSubmit,
  }
}
