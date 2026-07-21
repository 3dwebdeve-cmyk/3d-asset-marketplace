import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'

import {
  deletePluginFile,
  deletePluginImage,
  uploadPluginFile,
  uploadPluginImage,
} from '../../api/pluginsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import {
  formatFileSize,
  formatFormatLabel,
  PLUGIN_IMAGE_ACCEPT,
  PLUGIN_IMAGE_FORMAT_LABELS,
  PLUGIN_IMAGE_MAX_MB,
  PLUGIN_PACKAGE_ACCEPT,
  PLUGIN_PACKAGE_FORMAT_LABELS,
  PLUGIN_PACKAGE_MAX_MB,
} from '../../lib/pluginUpload'
import { toast } from '../../lib/toast'
import type { AdminPlugin } from '../../types/plugin'

interface PluginMediaSectionProps {
  pluginId: string
  plugin: AdminPlugin
}

function validateFile(file: File, extensions: readonly string[], maxMb: number): string | null {
  const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
  if (!extensions.includes(extension)) return `Allowed formats: ${extensions.join(', ')}.`
  if (file.size <= 0) return 'The selected file is empty.'
  if (file.size > maxMb * 1024 * 1024) return `The selected file must be ${maxMb} MB or smaller.`
  return null
}

function FormatBadges({ labels }: { labels: readonly string[] }) {
  return (
    <div className="admin-format-badges" aria-label="Supported formats">
      {labels.map((label) => <span key={label} className="admin-format-badge">{label}</span>)}
    </div>
  )
}

export function PluginMediaSection({ pluginId, plugin }: PluginMediaSectionProps) {
  const queryClient = useQueryClient()
  const imageInput = useRef<HTMLInputElement>(null)
  const packageInput = useRef<HTMLInputElement>(null)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [packageVersion, setPackageVersion] = useState(plugin.version)
  const [packageIsPrimary, setPackageIsPrimary] = useState(true)
  const [imageDragActive, setImageDragActive] = useState(false)
  const [packageDragActive, setPackageDragActive] = useState(false)

  const invalidatePlugin = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['admin', 'plugins', pluginId],
      exact: true,
    })
  }
  const imageUpload = useMutation({
    mutationFn: (file: File) => uploadPluginImage(pluginId, { image: file, is_primary: true }),
    onSuccess: async () => {
      toast.success('Plugin image uploaded')
      setMediaError(null)
      if (imageInput.current) imageInput.current.value = ''
      await invalidatePlugin()
    },
    onError: (error) => setMediaError(getApiErrorMessage(error, 'Could not upload image.')),
  })
  const imageDelete = useMutation({
    mutationFn: (imageId: string) => deletePluginImage(pluginId, imageId),
    onSuccess: async () => {
      toast.success('Plugin image removed')
      setMediaError(null)
      await invalidatePlugin()
    },
    onError: (error) => setMediaError(getApiErrorMessage(error, 'Could not remove image.')),
  })
  const packageUpload = useMutation({
    mutationFn: (file: File) =>
      uploadPluginFile(pluginId, {
        file,
        version: packageVersion.trim(),
        is_primary: packageIsPrimary,
      }),
    onSuccess: async () => {
      toast.success('Plugin package uploaded')
      setMediaError(null)
      if (packageInput.current) packageInput.current.value = ''
      await invalidatePlugin()
    },
    onError: (error) =>
      setMediaError(getApiErrorMessage(error, 'Could not upload plugin package.')),
  })
  const packageDelete = useMutation({
    mutationFn: (fileId: string) => deletePluginFile(pluginId, fileId),
    onSuccess: async () => {
      toast.success('Plugin package removed')
      setMediaError(null)
      await invalidatePlugin()
    },
    onError: (error) =>
      setMediaError(getApiErrorMessage(error, 'Could not remove plugin package.')),
  })

  const submitImage = (file: File) => {
    const error = validateFile(file, ['.jpg', '.jpeg', '.png', '.webp'], PLUGIN_IMAGE_MAX_MB)
    setMediaError(error)
    if (!error) imageUpload.mutate(file)
  }
  const submitPackage = (file: File) => {
    const error = packageVersion.trim()
      ? validateFile(file, ['.zip', '.rar', '.7z'], PLUGIN_PACKAGE_MAX_MB)
      : 'Package version is required.'
    setMediaError(error)
    if (!error) packageUpload.mutate(file)
  }
  const selectedFile = (
    event: ChangeEvent<HTMLInputElement>,
    submit: (file: File) => void,
  ) => {
    const file = event.target.files?.[0]
    if (file) submit(file)
  }
  const droppedFile = (
    event: DragEvent<HTMLDivElement>,
    setActive: (active: boolean) => void,
    submit: (file: File) => void,
  ) => {
    event.preventDefault()
    setActive(false)
    const file = event.dataTransfer.files?.[0]
    if (file) submit(file)
  }

  return (
    <section className="admin-media-section" aria-labelledby="plugin-media-title">
      <h2 id="plugin-media-title">Images and plugin packages</h2>
      <p className="home-page__subtitle">
        Upload listing images and validated delivery archives for this plugin.
      </p>
      {mediaError ? <Alert variant="error" message={mediaError} /> : null}

      <div className="admin-media-panel">
        <h3 className="admin-media-panel__title">Plugin images</h3>
        <p className="admin-media-panel__hint">
          New uploads become the primary listing image. Max {PLUGIN_IMAGE_MAX_MB} MB.
        </p>
        <FormatBadges labels={PLUGIN_IMAGE_FORMAT_LABELS} />
        <div
          className={`admin-media-upload${imageDragActive ? ' admin-media-upload--active' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); setImageDragActive(true) }}
          onDragOver={(event) => { event.preventDefault(); setImageDragActive(true) }}
          onDragLeave={(event) => { event.preventDefault(); setImageDragActive(false) }}
          onDrop={(event) => droppedFile(event, setImageDragActive, submitImage)}
        >
          <input
            ref={imageInput}
            id="plugin-image-upload"
            className="admin-media-upload__input"
            type="file"
            accept={PLUGIN_IMAGE_ACCEPT}
            disabled={imageUpload.isPending}
            onChange={(event) => selectedFile(event, submitImage)}
          />
          <label htmlFor="plugin-image-upload" className="admin-media-upload__label">
            {imageUpload.isPending ? <Spinner label="Uploading image..." /> : (
              <><strong>Choose image</strong> or drag and drop here</>
            )}
          </label>
        </div>
        {plugin.images.length ? (
          <ul className="admin-media-list">
            {plugin.images.map((image) => (
              <li key={image.id} className="admin-media-item">
                <img className="admin-media-thumb" src={image.image_url} alt={image.is_primary ? 'Primary plugin image' : 'Plugin gallery image'} />
                <div className="admin-media-item__content">
                  <p className="admin-media-item__title">{image.is_primary ? 'Primary image' : 'Gallery image'}</p>
                  <div className="admin-media-item__actions">
                    <a className="auth-link" href={image.image_url} target="_blank" rel="noreferrer">Open</a>
                    <Button type="button" variant="secondary" isLoading={imageDelete.isPending} onClick={() => imageDelete.mutate(image.id)}>Remove</Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="home-page__subtitle">No images uploaded yet.</p>}
      </div>

      <div className="admin-media-panel">
        <h3 className="admin-media-panel__title">Plugin packages</h3>
        <p className="admin-media-panel__hint">
          The server verifies archive signatures and safely inspects ZIP metadata. Max {PLUGIN_PACKAGE_MAX_MB} MB.
        </p>
        <FormatBadges labels={PLUGIN_PACKAGE_FORMAT_LABELS} />
        <FormField id="plugin-package-version" label="Package version">
          <Input id="plugin-package-version" maxLength={64} value={packageVersion} onChange={(event) => setPackageVersion(event.target.value)} />
        </FormField>
        <label className="ui-input admin-media-checkbox">
          <input type="checkbox" checked={packageIsPrimary} onChange={(event) => setPackageIsPrimary(event.target.checked)} />{' '}
          Set as primary delivery package
        </label>
        <div
          className={`admin-media-upload${packageDragActive ? ' admin-media-upload--active' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); setPackageDragActive(true) }}
          onDragOver={(event) => { event.preventDefault(); setPackageDragActive(true) }}
          onDragLeave={(event) => { event.preventDefault(); setPackageDragActive(false) }}
          onDrop={(event) => droppedFile(event, setPackageDragActive, submitPackage)}
        >
          <input
            ref={packageInput}
            id="plugin-package-upload"
            className="admin-media-upload__input"
            type="file"
            accept={PLUGIN_PACKAGE_ACCEPT}
            disabled={packageUpload.isPending}
            onChange={(event) => selectedFile(event, submitPackage)}
          />
          <label htmlFor="plugin-package-upload" className="admin-media-upload__label">
            {packageUpload.isPending ? <Spinner label="Uploading package..." /> : (
              <><strong>Choose package</strong> or drag and drop here</>
            )}
          </label>
        </div>
        {plugin.files.length ? (
          <ul className="admin-media-list">
            {plugin.files.map((file) => (
              <li key={file.id} className="admin-media-item admin-media-item--file">
                <span className="admin-format-badge admin-format-badge--large">{formatFormatLabel(file.file_format)}</span>
                <div className="admin-media-item__content">
                  <p className="admin-media-item__title">{file.file_name}</p>
                  <p className="admin-media-item__meta">Version {file.version} · {formatFileSize(file.file_size)}{file.is_primary ? ' · Primary' : ''}</p>
                  <div className="admin-media-item__actions">
                    <Button type="button" variant="secondary" isLoading={packageDelete.isPending} onClick={() => packageDelete.mutate(file.id)}>Remove</Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="home-page__subtitle">No plugin packages uploaded yet.</p>}
      </div>
    </section>
  )
}
