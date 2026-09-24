import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'

import {
  deleteProductFile,
  deleteProductImage,
  uploadProductFile,
  uploadProductImage,
} from '../../api/productsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import {
  formatFormatLabel,
  isPreviewModelFile,
  PREVIEW_MODEL_FORMATS,
  PRODUCT_FILE_ACCEPT,
  PRODUCT_FILE_FORMAT_LABELS,
  PRODUCT_FILE_MAX_MB,
  PRODUCT_PREVIEW_MAX_MB,
  PRODUCT_IMAGE_ACCEPT,
  PRODUCT_IMAGE_FORMAT_LABELS,
  PRODUCT_IMAGE_MAX_MB,
} from '../../lib/productUpload'
import { formatFileSize } from '../../lib/format'
import { FormatBadges } from '../../components/admin/FormatBadges'
import { toast } from '../../lib/toast'
import type { AdminProduct } from '../../types/product'

interface ProductMediaSectionProps {
  productId: string
  product: AdminProduct
}

export function ProductMediaSection({ productId, product }: ProductMediaSectionProps) {
  const queryClient = useQueryClient()
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [fileVersion, setFileVersion] = useState('1.0')
  const [isImageDragActive, setIsImageDragActive] = useState(false)
  const [isFileDragActive, setIsFileDragActive] = useState(false)

  const invalidateProduct = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'products', productId] })
  }

  const imageUploadMutation = useMutation({
    mutationFn: (file: File) =>
      uploadProductImage(productId, { image: file, is_primary: true }),
    onSuccess: async () => {
      toast.success('Image uploaded and set as primary thumbnail')
      setMediaError(null)
      if (imageInputRef.current) {
        imageInputRef.current.value = ''
      }
      await invalidateProduct()
    },
    onError: (error) => {
      setMediaError(getApiErrorMessage(error, 'Could not upload image.'))
    },
  })

  const imageDeleteMutation = useMutation({
    mutationFn: (imageId: string) => deleteProductImage(productId, imageId),
    onSuccess: async () => {
      toast.success('Image removed')
      setMediaError(null)
      await invalidateProduct()
    },
    onError: (error) => {
      setMediaError(getApiErrorMessage(error, 'Could not remove image.'))
    },
  })

  const fileUploadMutation = useMutation({
    mutationFn: (file: File) =>
      uploadProductFile(productId, {
        file,
        version: fileVersion,
        // GLB/glTF always become the interactive preview (server also enforces this).
        is_preview: isPreviewModelFile(file),
      }),
    onSuccess: async (uploaded) => {
      toast.success(
        uploaded.is_preview && PREVIEW_MODEL_FORMATS.has(uploaded.file_format)
          ? 'Preview model uploaded for 3D viewer'
          : 'Model file uploaded',
      )
      setMediaError(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      await invalidateProduct()
    },
    onError: (error) => {
      setMediaError(getApiErrorMessage(error, 'Could not upload file.'))
    },
  })

  const fileDeleteMutation = useMutation({
    mutationFn: (fileId: string) => deleteProductFile(productId, fileId),
    onSuccess: async () => {
      toast.success('File removed')
      setMediaError(null)
      await invalidateProduct()
    },
    onError: (error) => {
      setMediaError(getApiErrorMessage(error, 'Could not remove file.'))
    },
  })

  const uploadImage = (file: File) => {
    setMediaError(null)
    imageUploadMutation.mutate(file)
  }

  const uploadFile = (file: File) => {
    setMediaError(null)
    fileUploadMutation.mutate(file)
  }

  const onImageSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      uploadImage(file)
    }
  }

  const onFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      uploadFile(file)
    }
  }

  const onImageDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsImageDragActive(false)
    const file = event.dataTransfer.files?.[0]
    if (file) {
      uploadImage(file)
    }
  }

  const onFileDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsFileDragActive(false)
    const file = event.dataTransfer.files?.[0]
    if (file) {
      uploadFile(file)
    }
  }

  return (
    <section className="admin-media-section" aria-labelledby="product-media-title">
      <h2 id="product-media-title">Images and model files</h2>
      <p className="home-page__subtitle">
        Upload gallery images for thumbnails and downloadable 3D model files for customers.
      </p>
      {mediaError ? <Alert variant="error" message={mediaError} /> : null}

      <div className="admin-media-panel">
        <h3 className="admin-media-panel__title">Product images</h3>
        <p className="admin-media-panel__hint">
          Primary uploads become the product thumbnail automatically. Max {PRODUCT_IMAGE_MAX_MB}{' '}
          MB per image.
        </p>
        <FormatBadges labels={PRODUCT_IMAGE_FORMAT_LABELS} />

        <div
          className={`admin-media-upload${isImageDragActive ? ' admin-media-upload--active' : ''}`}
          onDragEnter={(event) => {
            event.preventDefault()
            setIsImageDragActive(true)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setIsImageDragActive(true)
          }}
          onDragLeave={(event) => {
            event.preventDefault()
            setIsImageDragActive(false)
          }}
          onDrop={onImageDrop}
        >
          <input
            ref={imageInputRef}
            id="product-image-upload"
            className="admin-media-upload__input"
            type="file"
            accept={PRODUCT_IMAGE_ACCEPT}
            onChange={onImageSelected}
            disabled={imageUploadMutation.isPending}
          />
          <label htmlFor="product-image-upload" className="admin-media-upload__label">
            {imageUploadMutation.isPending ? (
              <Spinner label="Uploading image..." />
            ) : (
              <>
                <strong>Choose image</strong> or drag and drop here
              </>
            )}
          </label>
        </div>

        {product.images.length ? (
          <ul className="admin-media-list">
            {product.images.map((image) => (
              <li key={image.id} className="admin-media-item">
                <img
                  className="admin-media-thumb"
                  src={image.image_url}
                  alt={image.is_primary ? 'Primary product image' : 'Product gallery image'}
                />
                <div className="admin-media-item__content">
                  <p className="admin-media-item__title">
                    {image.is_primary ? 'Primary thumbnail' : 'Gallery image'}
                  </p>
                  <p className="admin-media-item__meta">
                    {image.is_primary
                      ? 'Used on listings and dashboard'
                      : 'Additional gallery image'}
                  </p>
                  <div className="admin-media-item__actions">
                    <a
                      className="auth-link"
                      href={image.image_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                    <Button
                      type="button"
                      variant="secondary"
                      isLoading={imageDeleteMutation.isPending}
                      onClick={() => imageDeleteMutation.mutate(image.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="home-page__subtitle">No images uploaded yet.</p>
        )}
      </div>

      <div className="admin-media-panel">
        <h3 className="admin-media-panel__title">3D model files</h3>
        <p className="admin-media-panel__hint">
          Upload source and delivery formats for this product. Packages max{' '}
          {PRODUCT_FILE_MAX_MB} MB. Interactive GLB/GLTF previews max {PRODUCT_PREVIEW_MAX_MB} MB
          (keep them light for the 3D viewer).
        </p>
        <FormatBadges labels={PRODUCT_FILE_FORMAT_LABELS} />

        <FormField id="product-file-version" label="File version">
          <Input
            id="product-file-version"
            value={fileVersion}
            onChange={(event) => setFileVersion(event.target.value)}
          />
        </FormField>
        <p className="home-page__subtitle">
          GLB and GLTF uploads are always used as the interactive 3D preview.
          Other formats are stored as downloadable package files.
        </p>

        <div
          className={`admin-media-upload${isFileDragActive ? ' admin-media-upload--active' : ''}`}
          onDragEnter={(event) => {
            event.preventDefault()
            setIsFileDragActive(true)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setIsFileDragActive(true)
          }}
          onDragLeave={(event) => {
            event.preventDefault()
            setIsFileDragActive(false)
          }}
          onDrop={onFileDrop}
        >
          <input
            ref={fileInputRef}
            id="product-file-upload"
            className="admin-media-upload__input"
            type="file"
            accept={PRODUCT_FILE_ACCEPT}
            onChange={onFileSelected}
            disabled={fileUploadMutation.isPending}
          />
          <label htmlFor="product-file-upload" className="admin-media-upload__label">
            {fileUploadMutation.isPending ? (
              <Spinner label="Uploading model file..." />
            ) : (
              <>
                <strong>Choose model file</strong> or drag and drop here
              </>
            )}
          </label>
        </div>

        {product.files.length ? (
          <ul className="admin-media-list">
            {product.files.map((file) => (
              <li key={file.id} className="admin-media-item admin-media-item--file">
                <span className="admin-format-badge admin-format-badge--large">
                  {formatFormatLabel(file.file_format)}
                </span>
                <div className="admin-media-item__content">
                  <p className="admin-media-item__title">{file.file_name}</p>
                  <p className="admin-media-item__meta">
                    Version {file.version} · {formatFileSize(file.file_size)}
                    {file.is_preview && PREVIEW_MODEL_FORMATS.has(file.file_format)
                      ? ' · Interactive preview'
                      : ''}
                  </p>
                  <div className="admin-media-item__actions">
                    <a
                      className="auth-link"
                      href={file.storage_path}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                    <Button
                      type="button"
                      variant="secondary"
                      isLoading={fileDeleteMutation.isPending}
                      onClick={() => fileDeleteMutation.mutate(file.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="home-page__subtitle">No downloadable files yet.</p>
        )}
      </div>
    </section>
  )
}
