import { apiClient } from './client'
import type {
  AdminCategory,
  AdminCategoryCreatePayload,
  AdminCategoryListParams,
  AdminCategoryUpdatePayload,
  CategoryPublic,
  PaginatedAdminCategories,
  PaginatedPublicCategories,
  PublicCategoryListParams,
} from '../types/category'

export async function listPublicCategories(
  params: PublicCategoryListParams = {},
): Promise<PaginatedPublicCategories> {
  const response = await apiClient.get<PaginatedPublicCategories>('/api/v1/categories/', {
    params,
  })
  return response.data
}

export async function listTrendingCategories(limit = 12): Promise<CategoryPublic[]> {
  const response = await apiClient.get<CategoryPublic[]>('/api/v1/categories/trending/', {
    params: { limit },
  })
  return response.data
}

export async function recordCategoryClick(
  categoryId: string,
): Promise<{ id: string; click_count: number }> {
  const response = await apiClient.post<{ id: string; click_count: number }>(
    `/api/v1/categories/${categoryId}/click/`,
  )
  return response.data
}

export async function listAdminCategories(
  params: AdminCategoryListParams = {},
): Promise<PaginatedAdminCategories> {
  const response = await apiClient.get<PaginatedAdminCategories>(
    '/api/v1/admin/categories/',
    { params },
  )
  return response.data
}

export async function getAdminCategory(categoryId: string): Promise<AdminCategory> {
  const response = await apiClient.get<AdminCategory>(
    `/api/v1/admin/categories/${categoryId}/`,
  )
  return response.data
}

export async function createAdminCategory(
  payload: AdminCategoryCreatePayload,
): Promise<AdminCategory> {
  const response = await apiClient.post<AdminCategory>(
    '/api/v1/admin/categories/',
    payload,
  )
  return response.data
}

export async function updateAdminCategory(
  categoryId: string,
  payload: AdminCategoryUpdatePayload,
): Promise<AdminCategory> {
  const response = await apiClient.patch<AdminCategory>(
    `/api/v1/admin/categories/${categoryId}/`,
    payload,
  )
  return response.data
}

/** A category an upload created goes live; its models can then be approved. */
export async function approveAdminCategory(categoryId: string): Promise<AdminCategory> {
  const response = await apiClient.post<AdminCategory>(
    `/api/v1/admin/categories/${categoryId}/approve/`,
  )
  return response.data
}

/** Move a pending category's models into an active category and delete it; returns the target. */
export async function mergeAdminCategory(categoryId: string, intoId: string): Promise<AdminCategory> {
  const response = await apiClient.post<AdminCategory>(
    `/api/v1/admin/categories/${categoryId}/merge/`,
    { into: intoId },
  )
  return response.data
}

/** Reject a pending category: null when it was empty and is deleted, else it stays hidden. */
export async function rejectAdminCategory(categoryId: string): Promise<AdminCategory | null> {
  const response = await apiClient.post<AdminCategory | ''>(
    `/api/v1/admin/categories/${categoryId}/reject/`,
  )
  return response.status === 204 || !response.data ? null : response.data
}

export async function deactivateAdminCategory(categoryId: string): Promise<AdminCategory> {
  const response = await apiClient.delete<AdminCategory>(
    `/api/v1/admin/categories/${categoryId}/`,
  )
  return response.data
}
