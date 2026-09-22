import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'

import {
  downloadAdminProjectDelivery,
  listAdminProjectDeliveries,
  updateAdminCustomProject,
  uploadAdminProjectDelivery,
} from '../../api/customProjectsApi'
import {
  PROJECT_DELIVERY_PAGE_SIZE,
  ProjectDeliveriesList,
} from '../../components/projects/ProjectDeliveriesList'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { getApiErrorMessage } from '../../lib/apiError'
import { formatFileSize } from '../../lib/format'
import {
  PROJECT_DELIVERY_ACCEPT,
  PROJECT_DELIVERY_FORMAT_LABELS,
  PROJECT_DELIVERY_MAX_MB,
  validateProjectDeliveryFile,
} from '../../lib/projectDeliveryUpload'
import { toast } from '../../lib/toast'
import type { CustomProjectStatus, ProjectDelivery } from '../../types/customProject'

const NOTES_MAX_LENGTH = 2000

interface AdminProjectDeliveriesSectionProps {
  projectId: string
  status: CustomProjectStatus
  onStatusChange?: (status: CustomProjectStatus) => void
}

export function AdminProjectDeliveriesSection({
  projectId,
  status,
  onStatusChange,
}: AdminProjectDeliveriesSectionProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [notes, setNotes] = useState('')
  const [version, setVersion] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  const deliveriesQuery = useQuery({
    queryKey: ['admin', 'custom-projects', projectId, 'deliveries'],
    queryFn: () =>
      listAdminProjectDeliveries(projectId, {
        page: 1,
        page_size: PROJECT_DELIVERY_PAGE_SIZE,
      }),
    enabled: Boolean(projectId),
    retry: false,
  })

  const invalidateDeliveries = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['admin', 'custom-projects', projectId, 'deliveries'],
    })
  }

  const invalidateProject = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['admin', 'custom-projects'],
      refetchType: 'none',
    })
    await queryClient.invalidateQueries({
      queryKey: ['admin', 'custom-projects', projectId],
      exact: true,
    })
  }

  const uploadMutation = useMutation({
    mutationFn: (payload: { file: File; notes: string; version?: number }) =>
      uploadAdminProjectDelivery(projectId, payload),
    onSuccess: async () => {
      toast.success('Deliverable uploaded')
      setUploadError(null)
      setSelectedFile(null)
      setNotes('')
      setVersion('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      await invalidateDeliveries()
    },
    onError: (error) => {
      setUploadError(getApiErrorMessage(error, 'Could not upload deliverable.'))
    },
  })

  const statusMutation = useMutation({
    mutationFn: (nextStatus: CustomProjectStatus) =>
      updateAdminCustomProject(projectId, { status: nextStatus }),
    onSuccess: async (project) => {
      toast.success(
        project.status === 'completed'
          ? 'Project marked completed'
          : 'Project marked delivered',
      )
      setStatusError(null)
      onStatusChange?.(project.status)
      await invalidateProject()
    },
    onError: (error) => {
      setStatusError(getApiErrorMessage(error, 'Could not update project status.'))
    },
  })

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      setSelectedFile(null)
      return
    }
    const validationError = validateProjectDeliveryFile(file)
    if (validationError) {
      setUploadError(validationError)
      setSelectedFile(null)
      event.target.value = ''
      return
    }
    setUploadError(null)
    setSelectedFile(file)
  }

  const onUploadSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!selectedFile) {
      setUploadError('Choose a deliverable file to upload.')
      return
    }
    const trimmedNotes = notes.trim()
    if (trimmedNotes.length > NOTES_MAX_LENGTH) {
      setUploadError(`Notes cannot exceed ${NOTES_MAX_LENGTH} characters.`)
      return
    }
    let parsedVersion: number | undefined
    const versionRaw = version.trim()
    if (versionRaw) {
      parsedVersion = Number(versionRaw)
      if (!Number.isInteger(parsedVersion) || parsedVersion < 1) {
        setUploadError('Version must be a positive integer.')
        return
      }
    }
    setUploadError(null)
    uploadMutation.mutate({
      file: selectedFile,
      notes: trimmedNotes,
      ...(parsedVersion != null ? { version: parsedVersion } : {}),
    })
  }

  const onDownload = async (delivery: ProjectDelivery) => {
    setDownloadError(null)
    try {
      await downloadAdminProjectDelivery(projectId, delivery.id, delivery.file_name)
    } catch (error) {
      setDownloadError(
        getApiErrorMessage(error, 'Could not download the deliverable. Please try again.'),
      )
    }
  }

  const isUploading = uploadMutation.isPending
  const isUpdatingStatus = statusMutation.isPending
  const canMarkDelivered = status === 'in_progress'
  const canMarkCompleted = status === 'delivered'

  return (
    <section
      className="admin-media-section admin-project-deliveries"
      aria-labelledby="admin-project-deliveries-title"
    >
      <h2 id="admin-project-deliveries-title">Deliverables</h2>
      <p className="admin-project-deliveries__hint">
        Upload final packages for the customer. Downloads use authenticated endpoints (storage
        paths are never exposed).
      </p>

      {statusError ? <Alert variant="error" message={statusError} /> : null}

      <div className="admin-project-deliveries__status-actions">
        <Button
          type="button"
          variant="secondary"
          isLoading={isUpdatingStatus && statusMutation.variables === 'delivered'}
          disabled={!canMarkDelivered || isUpdatingStatus}
          onClick={() => statusMutation.mutate('delivered')}
        >
          Mark delivered
        </Button>
        <Button
          type="button"
          variant="secondary"
          isLoading={isUpdatingStatus && statusMutation.variables === 'completed'}
          disabled={!canMarkCompleted || isUpdatingStatus}
          onClick={() => statusMutation.mutate('completed')}
        >
          Mark completed
        </Button>
      </div>
      {!canMarkDelivered && !canMarkCompleted ? (
        <p className="admin-project-deliveries__status-hint" role="status">
          {status === 'completed'
            ? 'This project is already completed.'
            : 'Mark delivered is available from In progress; Mark completed from Delivered.'}
        </p>
      ) : null}

      <ProjectDeliveriesList
        titleId="admin-project-deliveries-title"
        deliveries={deliveriesQuery.data?.results ?? []}
        isLoading={deliveriesQuery.isLoading}
        isError={deliveriesQuery.isError}
        isFetching={deliveriesQuery.isFetching}
        error={deliveriesQuery.error}
        emptyMessage="No deliverables uploaded yet."
        downloadError={downloadError}
        showUploaderEmail
        onRetry={() => void deliveriesQuery.refetch()}
        onDownload={(delivery) => void onDownload(delivery)}
        footer={
          <form className="admin-create-form" onSubmit={onUploadSubmit} noValidate>
            {uploadError ? <Alert variant="error" message={uploadError} /> : null}
            <FormField id="admin-project-delivery-file" label="Upload deliverable">
              <input
                ref={fileInputRef}
                id="admin-project-delivery-file"
                type="file"
                accept={PROJECT_DELIVERY_ACCEPT}
                disabled={isUploading}
                onChange={onFileChange}
              />
            </FormField>
            <p className="admin-project-deliveries__hint">
              Allowed: {PROJECT_DELIVERY_FORMAT_LABELS.join(', ')}. Max {PROJECT_DELIVERY_MAX_MB}{' '}
              MB.
            </p>
            {selectedFile ? (
              <p className="home-page__subtitle" role="status">
                Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                <button
                  type="button"
                  className="auth-link admin-project-deliveries__clear-file"
                  disabled={isUploading}
                  onClick={() => {
                    setSelectedFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                >
                  Remove
                </button>
              </p>
            ) : null}
            <FormField id="admin-project-delivery-notes" label="Notes (optional)">
              <Input
                id="admin-project-delivery-notes"
                value={notes}
                maxLength={NOTES_MAX_LENGTH}
                disabled={isUploading}
                onChange={(event) => setNotes(event.target.value)}
              />
            </FormField>
            <FormField id="admin-project-delivery-version" label="Version (optional)">
              <Input
                id="admin-project-delivery-version"
                type="number"
                min={1}
                step={1}
                value={version}
                disabled={isUploading}
                placeholder="Auto next version"
                onChange={(event) => setVersion(event.target.value)}
              />
            </FormField>
            <Button type="submit" isLoading={isUploading} disabled={!selectedFile}>
              Upload deliverable
            </Button>
          </form>
        }
      />
    </section>
  )
}
