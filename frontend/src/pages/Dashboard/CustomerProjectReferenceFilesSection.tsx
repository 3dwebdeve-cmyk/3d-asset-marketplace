import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'

import {
  deleteCustomerCustomProjectFile,
  uploadCustomerCustomProjectFile,
} from '../../api/customProjectsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/ui/FormField'
import { getApiErrorMessage } from '../../lib/apiError'
import { formatFileSize } from '../../lib/productUpload'
import {
  PROJECT_FILE_ACCEPT,
  PROJECT_FILE_FORMAT_LABELS,
  PROJECT_FILE_MAX_MB,
  validateProjectFile,
} from '../../lib/projectFileUpload'
import { toast } from '../../lib/toast'
import type {
  CustomProjectStatus,
  CustomerCustomProject,
  ProjectFileType,
} from '../../types/customProject'

const FILE_TYPE_LABELS: Record<ProjectFileType, string> = {
  reference_image: 'Reference image',
  cad_drawing: 'CAD drawing',
  sketch: 'Sketch',
  other: 'Other',
}

const CLOSED_STATUSES: ReadonlySet<CustomProjectStatus> = new Set([
  'completed',
  'rejected',
  'cancelled',
])

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

interface CustomerProjectReferenceFilesSectionProps {
  project: CustomerCustomProject
}

export function CustomerProjectReferenceFilesSection({
  project,
}: CustomerProjectReferenceFilesSectionProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileType, setFileType] = useState<ProjectFileType>('reference_image')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const canUpload = !CLOSED_STATUSES.has(project.status)

  const uploadMutation = useMutation({
    mutationFn: (payload: { file: File; file_type: ProjectFileType }) =>
      uploadCustomerCustomProjectFile(project.id, payload, setUploadProgress),
    onSuccess: async () => {
      toast.success('Reference file uploaded')
      setUploadError(null)
      setSelectedFile(null)
      setFileType('reference_image')
      setUploadProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await queryClient.invalidateQueries({
        queryKey: ['customer', 'custom-projects', project.id],
        exact: true,
      })
    },
    onError: () => {
      setUploadProgress(0)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) =>
      deleteCustomerCustomProjectFile(project.id, fileId),
    onSuccess: async () => {
      toast.success('Reference file removed')
      setPendingDeleteId(null)
      await queryClient.invalidateQueries({
        queryKey: ['customer', 'custom-projects', project.id],
        exact: true,
      })
    },
    onError: (error) => {
      setPendingDeleteId(null)
      toast.error(getApiErrorMessage(error, 'Could not delete the file. Please try again.'))
    },
  })

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setUploadError(null)
    if (!file) {
      setSelectedFile(null)
      return
    }
    const validationError = validateProjectFile(file)
    if (validationError) {
      setUploadError(validationError)
      setSelectedFile(null)
      event.target.value = ''
      return
    }
    setSelectedFile(file)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!selectedFile) {
      setUploadError('Choose a file to upload.')
      return
    }
    uploadMutation.mutate({ file: selectedFile, file_type: fileType })
  }

  const onDeleteClick = (fileId: string) => {
    setPendingDeleteId(fileId)
  }

  const onDeleteConfirm = () => {
    if (pendingDeleteId) {
      deleteMutation.mutate(pendingDeleteId)
    }
  }

  const onDeleteCancel = () => {
    setPendingDeleteId(null)
  }

  const serverError = uploadMutation.isError
    ? getApiErrorMessage(uploadMutation.error, 'Could not upload the file. Please try again.')
    : null

  return (
    <section className="admin-media-section" aria-labelledby="project-files-title">
      <h2 id="project-files-title">Reference files</h2>

      {pendingDeleteId ? (
        <div className="project-delete-confirm" role="alertdialog" aria-labelledby="delete-confirm-title">
          <p id="delete-confirm-title">
            <strong>Remove this reference file?</strong> This cannot be undone.
          </p>
          <div className="dashboard-card__actions">
            <Button
              type="button"
              isLoading={deleteMutation.isPending}
              onClick={onDeleteConfirm}
            >
              Remove
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={deleteMutation.isPending}
              onClick={onDeleteCancel}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {project.files.length ? (
        <ul className="admin-media-list">
          {project.files.map((file) => (
            <li key={file.id} className="admin-media-item admin-media-item--file">
              <span className="admin-format-badge admin-format-badge--large">
                {FILE_TYPE_LABELS[file.file_type]}
              </span>
              <div className="admin-media-item__content">
                <p className="admin-media-item__title">{file.file_name}</p>
                <p className="admin-media-item__meta">
                  {formatFileSize(file.file_size)} · {formatDate(file.created_at)}
                </p>
              </div>
              {canUpload ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={deleteMutation.isPending}
                  onClick={() => onDeleteClick(file.id)}
                  aria-label={`Remove ${file.file_name}`}
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="home-page__subtitle" role="status">
          No reference files uploaded yet.
        </p>
      )}

      {canUpload ? (
        <form className="admin-media-upload" onSubmit={onSubmit}>
          <p className="home-page__subtitle">
            Upload sketches, photos, or CAD references ({PROJECT_FILE_FORMAT_LABELS.join(', ')}; max{' '}
            {PROJECT_FILE_MAX_MB} MB).
          </p>
          {uploadError || serverError ? (
            <Alert variant="error" message={uploadError ?? serverError ?? ''} />
          ) : null}
          <FormField id="project-reference-file-type" label="File type">
            <select
              id="project-reference-file-type"
              className="form-input"
              value={fileType}
              onChange={(event) => setFileType(event.target.value as ProjectFileType)}
            >
              {(Object.keys(FILE_TYPE_LABELS) as ProjectFileType[]).map((value) => (
                <option key={value} value={value}>
                  {FILE_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="project-reference-file" label="Upload reference file">
            <input
              ref={fileInputRef}
              id="project-reference-file"
              type="file"
              accept={PROJECT_FILE_ACCEPT}
              onChange={onFileChange}
            />
          </FormField>
          {uploadMutation.isPending && uploadProgress > 0 ? (
            <progress
              className="upload-progress"
              value={uploadProgress}
              max={100}
              aria-label={`Upload progress: ${uploadProgress}%`}
            />
          ) : null}
          <div className="dashboard-card__actions">
            <Button type="submit" isLoading={uploadMutation.isPending} disabled={!selectedFile}>
              Upload file
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  )
}
