import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'

import { resendEmailVerification } from '../../api/authApi'
import { getApiErrorMessage } from '../../lib/apiError'
import {
  defaultEmailVerificationResendValues,
  emailVerificationResendSchema,
  type EmailVerificationResendFormValues,
} from './emailVerificationResendSchema'

interface UseEmailVerificationResendFormResult {
  register: ReturnType<typeof useForm<EmailVerificationResendFormValues>>['register']
  handleSubmit: ReturnType<typeof useForm<EmailVerificationResendFormValues>>['handleSubmit']
  errors: ReturnType<typeof useForm<EmailVerificationResendFormValues>>['formState']['errors']
  isSubmitting: boolean
  serverError: string | null
  successMessage: string | null
  onSubmit: (values: EmailVerificationResendFormValues) => void
}

export function useEmailVerificationResendForm(): UseEmailVerificationResendFormResult {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EmailVerificationResendFormValues>({
    defaultValues: defaultEmailVerificationResendValues,
    mode: 'onBlur',
  })

  const mutation = useMutation({
    mutationFn: resendEmailVerification,
  })

  const onSubmit = (values: EmailVerificationResendFormValues) => {
    const parsed = emailVerificationResendSchema.safeParse(values)
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0]
        if (typeof field === 'string' && field in defaultEmailVerificationResendValues) {
          setError(field as keyof EmailVerificationResendFormValues, {
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
      ? getApiErrorMessage(mutation.error, 'Could not send verification email. Please try again.')
      : null,
    successMessage: mutation.isSuccess
      ? (mutation.data?.detail ?? 'Check your email for a verification link.')
      : null,
    onSubmit,
  }
}
