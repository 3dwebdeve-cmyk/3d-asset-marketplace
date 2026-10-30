import { apiClient } from './client'
import type {
  AdminProduct,
  AdminProductCreatePayload,
  AdminProductListParams,
  AdminProductRejectPayload,
  AdminProductUpdatePayload,
  PaginatedAdminProducts,
  PaginatedPublicProducts,
  ProductFile,
  ProductFileUploadPayload,
  ProductImage,
  ProductImageUploadPayload,
  PublicProductDetail,
  PublicProductListParams,
} from '../types/product'

export async function listPublicProducts(
  params: PublicProductListParams = {},
): Promise<PaginatedPublicProducts> {
  const response = await apiClient.get<PaginatedPublicProducts>('/api/v1/products/', {
    params,
  })
  return response.data
}

export async function getPublicProduct(slug: string): Promise<PublicProductDetail> {
  const response = await apiClient.get<PublicProductDetail>(`/api/v1/products/${slug}/`)
  return response.data
}

export async function listAdminProducts(
  params: AdminProductListParams = {},
): Promise<PaginatedAdminProducts> {
  const response = await apiClient.get<PaginatedAdminProducts>('/api/v1/admin/products/', {
    params,
  })
  return response.data
}

export async function getAdminProduct(productId: string): Promise<AdminProduct> {
  const response = await apiClient.get<AdminProduct>(`/api/v1/admin/products/${productId}/`)
  return response.data
}

export async function createAdminProduct(
  payload: AdminProductCreatePayload,
): Promise<AdminProduct> {
  const response = await apiClient.post<AdminProduct>('/api/v1/admin/products/', payload)
  return response.data
}

export async function updateAdminProduct(
  productId: string,
  payload: AdminProductUpdatePayload,
): Promise<AdminProduct> {
  const response = await apiClient.patch<AdminProduct>(
    `/api/v1/admin/products/${productId}/`,
    payload,
  )
  return response.data
}

export async function archiveAdminProduct(productId: string): Promise<AdminProduct> {
  const response = await apiClient.delete<AdminProduct>(
    `/api/v1/admin/products/${productId}/`,
  )
  return response.data
}

export async function removeAdminProduct(productId: string): Promise<void> {
  await apiClient.delete(`/api/v1/admin/products/${productId}/remove-from-admin/`)
}

export async function approveAdminProduct(productId: string): Promise<AdminProduct> {
  const response = await apiClient.post<AdminProduct>(
    `/api/v1/admin/products/${productId}/approve/`,
  )
  return response.data
}

export async function rejectAdminProduct(
  productId: string,
  payload: AdminProductRejectPayload,
): Promise<AdminProduct> {
  const response = await apiClient.post<AdminProduct>(
    `/api/v1/admin/products/${productId}/reject/`,
    payload,
  )
  return response.data
}

export async function requeueAdminProduct(productId: string): Promise<AdminProduct> {
  const response = await apiClient.post<AdminProduct>(
    `/api/v1/admin/products/${productId}/requeue/`,
  )
  return response.data
}

export async function uploadProductImage(
  productId: string,
  payload: ProductImageUploadPayload,
): Promise<ProductImage> {
  const formData = new FormData()
  formData.append('image', payload.image)
  formData.append('display_order', String(payload.display_order ?? 0))
  formData.append('is_primary', String(payload.is_primary ?? false))

  const response = await apiClient.post<ProductImage>(
    `/api/v1/admin/products/${productId}/images/`,
    formData,
  )
  return response.data
}

export async function deleteProductImage(
  productId: string,
  imageId: string,
): Promise<void> {
  await apiClient.delete(`/api/v1/admin/products/${productId}/images/${imageId}/`)
}

export async function uploadProductFile(
  productId: string,
  payload: ProductFileUploadPayload,
): Promise<ProductFile> {
  const formData = new FormData()
  formData.append('file', payload.file)
  formData.append('version', payload.version ?? '1.0')
  formData.append('is_preview', String(payload.is_preview ?? false))

  const response = await apiClient.post<ProductFile>(
    `/api/v1/admin/products/${productId}/files/`,
    formData,
  )
  return response.data
}

export async function deleteProductFile(
  productId: string,
  fileId: string,
): Promise<void> {
  await apiClient.delete(`/api/v1/admin/products/${productId}/files/${fileId}/`)
}
