import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useState } from 'react'

import { deleteAvatar, uploadAvatar } from '../../api/authApi'
import { toast } from '../../lib/toast'
import { useAuthStore } from '../../store/authStore'
import type { ApiErrorResponse, UserProfile } from '../../types/auth'
import { validateAvatarFile } from './avatarRules'

interface UseAvatarUploadResult {
  selectedFile: File | null
  previewUrl: string | null
  clientError: string | null
  serverError: string | null
  isUploading: boolean
  isRemoving: boolean
  onFileChange: (file: File | null) => void
  onUpload: () => void
  onRemove: () => void
}

function mapApiError(error: unknown): string {
  if (!isAxiosError<ApiErrorResponse>(error)) {
    return 'Could not update your avatar. Please try again.'
  }

  const data = error.response?.data
  if (!data) {
    return 'Could not update your avatar. Please try again.'
  }

  if (Array.isArray(data.avatar) && data.avatar[0]) {
    return data.avatar[0]
  }

  if (typeof data.detail === 'string') {
    return data.detail
  }

  return 'Could not update your avatar. Please try again.'
}

export function useAvatarUpload(profile: UserProfile | undefined): UseAvatarUploadResult {
  const queryClient = useQueryClient()
  const setUser = useAuthStore((state) => state.setUser)
  const storedUser = useAuthStore((state) => state.user)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [clientError, setClientError] = useState<string | null>(null)

  const applyProfile = (data: UserProfile) => {
    queryClient.setQueryData(['auth', 'profile'], data)
    void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    if (storedUser) {
      setUser({
        ...storedUser,
        avatar: data.avatar,
      })
    }
  }

  const uploadMutation = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: (data) => {
      applyProfile(data)
      setSelectedFile(null)
      setPreviewUrl(null)
      setClientError(null)
      toast.success('Avatar updated')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAvatar,
    onSuccess: (data) => {
      applyProfile(data)
      setSelectedFile(null)
      setPreviewUrl(null)
      setClientError(null)
      toast.success('Avatar removed')
    },
  })

  const onFileChange = (file: File | null) => {
    uploadMutation.reset()
    deleteMutation.reset()

    if (!file) {
      setSelectedFile(null)
      setPreviewUrl(null)
      setClientError(null)
      return
    }

    const validationError = validateAvatarFile(file)
    if (validationError) {
      setSelectedFile(null)
      setPreviewUrl(null)
      setClientError(validationError)
      return
    }

    setClientError(null)
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  return {
    selectedFile,
    previewUrl: previewUrl ?? (profile?.avatar ? profile.avatar : null),
    clientError,
    serverError:
      uploadMutation.isError
        ? mapApiError(uploadMutation.error)
        : deleteMutation.isError
          ? mapApiError(deleteMutation.error)
          : null,
    isUploading: uploadMutation.isPending,
    isRemoving: deleteMutation.isPending,
    onFileChange,
    onUpload: () => {
      if (!selectedFile) {
        setClientError('Choose an image before uploading.')
        return
      }
      uploadMutation.mutate(selectedFile)
    },
    onRemove: () => deleteMutation.mutate(),
  }
}
