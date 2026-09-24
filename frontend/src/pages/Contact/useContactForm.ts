import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router-dom'

import { submitContactForm } from '../../api/contactApi'
import { getApiErrorMessage } from '../../lib/apiError'
import {
  composeContactMessage,
  defaultContactValues,
  contactSchema,
  ENQUIRY_TYPES,
  type ContactFormValues,
} from './contactSchema'

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
const MAX_ATTACHMENTS = 5

interface UseContactFormResult {
  register: ReturnType<typeof useForm<ContactFormValues>>['register']
  handleSubmit: ReturnType<typeof useForm<ContactFormValues>>['handleSubmit']
  watch: ReturnType<typeof useForm<ContactFormValues>>['watch']
  setValue: ReturnType<typeof useForm<ContactFormValues>>['setValue']
  errors: ReturnType<typeof useForm<ContactFormValues>>['formState']['errors']
  isSubmitting: boolean
  serverError: string | null
  successMessage: string | null
  attachmentError: string | null
  attachments: File[]
  onAttachmentsChange: (files: FileList | File[] | null) => void
  clearAttachments: () => void
  onSubmit: (values: ContactFormValues) => void
}

function validateAttachments(files: File[]): string | null {
  if (files.length > MAX_ATTACHMENTS) {
    return `You can attach up to ${MAX_ATTACHMENTS} files.`
  }
  const oversized = files.find((file) => file.size > MAX_ATTACHMENT_BYTES)
  if (oversized) {
    return `"${oversized.name}" exceeds the 20MB limit.`
  }
  return null
}

export function useContactForm(): UseContactFormResult {
  const [searchParams] = useSearchParams()
  const [attachments, setAttachments] = useState<File[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setError,
    setValue,
    formState: { errors },
  } = useForm<ContactFormValues>({
    defaultValues: defaultContactValues,
    mode: 'onBlur',
  })

  useEffect(() => {
    const emailFromQuery = searchParams.get('email')?.trim()
    if (emailFromQuery) {
      setValue('email', emailFromQuery, { shouldDirty: true })
    }
    const enquiryFromQuery = searchParams.get('enquiryType')?.trim()
    if (
      enquiryFromQuery &&
      (ENQUIRY_TYPES as readonly string[]).includes(enquiryFromQuery)
    ) {
      setValue('enquiryType', enquiryFromQuery as ContactFormValues['enquiryType'], {
        shouldDirty: true,
      })
    }
  }, [searchParams, setValue])

  const mutation = useMutation({
    mutationFn: submitContactForm,
  })

  const onAttachmentsChange = (files: FileList | File[] | null) => {
    const next = files ? Array.from(files) : []
    const error = validateAttachments(next)
    setAttachmentError(error)
    setAttachments(error ? [] : next)
  }

  const clearAttachments = () => {
    setAttachments([])
    setAttachmentError(null)
  }

  const onSubmit = (values: ContactFormValues) => {
    const parsed = contactSchema.safeParse(values)
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0]
        if (typeof field === 'string') {
          setError(field as keyof ContactFormValues, {
            type: 'manual',
            message: issue.message,
          })
        }
      })
      return
    }

    const attachmentCheck = validateAttachments(attachments)
    if (attachmentCheck) {
      setAttachmentError(attachmentCheck)
      return
    }

    mutation.mutate({
      name: parsed.data.name,
      email: parsed.data.email,
      subject: parsed.data.subject,
      message: composeContactMessage(
        parsed.data,
        attachments.map((file) => file.name),
      ),
      website: parsed.data.website ?? '',
    })
  }

  return {
    register,
    handleSubmit,
    watch,
    setValue,
    errors,
    isSubmitting: mutation.isPending,
    serverError: mutation.isError
      ? getApiErrorMessage(mutation.error, 'Could not send your message. Please try again.')
      : null,
    successMessage: mutation.isSuccess
      ? (mutation.data?.detail ?? "Message sent — we'll reply by email.")
      : null,
    attachmentError,
    attachments,
    onAttachmentsChange,
    clearAttachments,
    onSubmit,
  }
}
