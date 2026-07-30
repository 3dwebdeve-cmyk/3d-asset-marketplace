import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'

import { submitContactForm } from '../../api/contactApi'
import { getApiErrorMessage } from '../../lib/apiError'
import {
  defaultContactValues,
  contactSchema,
  type ContactFormValues,
} from './contactSchema'

interface UseContactFormResult {
  register: ReturnType<typeof useForm<ContactFormValues>>['register']
  handleSubmit: ReturnType<typeof useForm<ContactFormValues>>['handleSubmit']
  errors: ReturnType<typeof useForm<ContactFormValues>>['formState']['errors']
  isSubmitting: boolean
  serverError: string | null
  successMessage: string | null
  onSubmit: (values: ContactFormValues) => void
}

export function useContactForm(): UseContactFormResult {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ContactFormValues>({
    defaultValues: defaultContactValues,
    mode: 'onBlur',
  })

  const mutation = useMutation({
    mutationFn: submitContactForm,
  })

  const onSubmit = (values: ContactFormValues) => {
    const parsed = contactSchema.safeParse(values)
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0]
        if (typeof field === 'string' && field in defaultContactValues) {
          setError(field as keyof ContactFormValues, {
            type: 'manual',
            message: issue.message,
          })
        }
      })
      return
    }

    mutation.mutate({
      name: parsed.data.name,
      email: parsed.data.email,
      subject: parsed.data.subject,
      message: parsed.data.message,
      website: parsed.data.website ?? '',
    })
  }

  return {
    register,
    handleSubmit,
    errors,
    isSubmitting: mutation.isPending,
    serverError: mutation.isError
      ? getApiErrorMessage(mutation.error, 'Could not send your message. Please try again.')
      : null,
    successMessage: mutation.isSuccess
      ? (mutation.data?.detail ?? "Message sent — we'll reply by email.")
      : null,
    onSubmit,
  }
}
