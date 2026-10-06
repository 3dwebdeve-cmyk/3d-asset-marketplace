import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import { updateProfile } from '../../api/authApi'
import { toast } from '../../lib/toast'
import { useAuthStore } from '../../store/authStore'
import type { ApiErrorResponse, UserProfile } from '../../types/auth'
import {
  defaultProfileValues,
  profileSchema,
  type ProfileFormValues,
} from './profileSchema'

interface UseProfileFormResult {
  register: ReturnType<typeof useForm<ProfileFormValues>>['register']
  handleSubmit: ReturnType<typeof useForm<ProfileFormValues>>['handleSubmit']
  errors: ReturnType<typeof useForm<ProfileFormValues>>['formState']['errors']
  isSubmitting: boolean
  isDirty: boolean
  serverError: string | null
  onSubmit: (values: ProfileFormValues) => void
}

function mapApiErrors(error: unknown): string {
  if (!isAxiosError<ApiErrorResponse>(error)) {
    return 'Could not save your profile. Please try again.'
  }

  const data = error.response?.data
  if (!data) {
    return 'Could not save your profile. Please try again.'
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

  return messages[0] ?? 'Could not save your profile. Please check your details.'
}

export function useProfileForm(profile: UserProfile | undefined): UseProfileFormResult {
  const queryClient = useQueryClient()
  const setUser = useAuthStore((state) => state.setUser)
  const storedUser = useAuthStore((state) => state.user)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    defaultValues: defaultProfileValues,
    mode: 'onBlur',
  })

  useEffect(() => {
    if (!profile) {
      return
    }

    reset({
      full_name: profile.full_name ?? '',
      company_name: profile.company_name ?? '',
      website: profile.website ?? '',
      address: profile.address ?? '',
      city: profile.city ?? '',
      country: profile.country ?? '',
    })
  }, [profile, reset])

  const mutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (data) => {
      queryClient.setQueryData(['auth', 'profile'], data)
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })

      if (storedUser) {
        setUser({
          ...storedUser,
          full_name: data.full_name,
          country: data.country,
        })
      }

      reset({
        full_name: data.full_name ?? '',
        company_name: data.company_name ?? '',
        website: data.website ?? '',
        address: data.address ?? '',
        city: data.city ?? '',
        country: data.country ?? '',
      })
      toast.success('Profile saved')
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

        if (field in defaultProfileValues) {
          setError(field as keyof ProfileFormValues, {
            type: 'server',
            message: value[0],
          })
        }
      })
    },
  })

  const onSubmit = (values: ProfileFormValues) => {
    const parsed = profileSchema.safeParse(values)
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0]
        if (typeof field === 'string' && field in defaultProfileValues) {
          setError(field as keyof ProfileFormValues, {
            type: 'manual',
            message: issue.message,
          })
        }
      })
      return
    }

    mutation.mutate({
      full_name: parsed.data.full_name,
      company_name: parsed.data.company_name,
      website: parsed.data.website,
      address: parsed.data.address,
      city: parsed.data.city,
      country: parsed.data.country,
    })
  }

  return {
    register,
    handleSubmit,
    errors,
    isSubmitting: mutation.isPending,
    isDirty,
    serverError: mutation.isError ? mapApiErrors(mutation.error) : null,
    onSubmit,
  }
}
