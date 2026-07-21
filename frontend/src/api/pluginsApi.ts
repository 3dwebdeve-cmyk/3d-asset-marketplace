import { apiClient } from './client'
import type {
  AdminPlugin,
  AdminPluginCreatePayload,
  AdminPluginListParams,
  AdminPluginUpdatePayload,
  PaginatedAdminPlugins,
  PaginatedPluginCategories,
  PluginCategory,
  PluginCategoryCreatePayload,
  PluginCategoryListParams,
  PluginCategoryUpdatePayload,
  PluginFile,
  PluginFileUploadPayload,
  PluginImage,
  PluginImageUploadPayload,
} from '../types/plugin'

export async function listAdminPlugins(
  params: AdminPluginListParams = {},
): Promise<PaginatedAdminPlugins> {
  const response = await apiClient.get<PaginatedAdminPlugins>('/api/admin/plugins/', { params })
  return response.data
}

export async function getAdminPlugin(pluginId: string): Promise<AdminPlugin> {
  const response = await apiClient.get<AdminPlugin>(`/api/admin/plugins/${pluginId}/`)
  return response.data
}

export async function createAdminPlugin(
  payload: AdminPluginCreatePayload,
): Promise<AdminPlugin> {
  const response = await apiClient.post<AdminPlugin>('/api/admin/plugins/', payload)
  return response.data
}

export async function updateAdminPlugin(
  pluginId: string,
  payload: AdminPluginUpdatePayload,
): Promise<AdminPlugin> {
  const response = await apiClient.patch<AdminPlugin>(
    `/api/admin/plugins/${pluginId}/`,
    payload,
  )
  return response.data
}

export async function archiveAdminPlugin(pluginId: string): Promise<AdminPlugin> {
  const response = await apiClient.delete<AdminPlugin>(`/api/admin/plugins/${pluginId}/`)
  return response.data
}

export async function listAdminPluginCategories(
  params: PluginCategoryListParams = {},
): Promise<PaginatedPluginCategories> {
  const response = await apiClient.get<PaginatedPluginCategories>(
    '/api/admin/plugin-categories/',
    { params },
  )
  return response.data
}

export async function listAllAdminPluginCategories(): Promise<PluginCategory[]> {
  const categories: PluginCategory[] = []
  let page = 1

  while (true) {
    const response = await listAdminPluginCategories({ page, page_size: 100 })
    categories.push(...response.results)
    if (!response.next || response.results.length === 0) {
      return categories
    }
    page += 1
  }
}

export async function getAdminPluginCategory(categoryId: string): Promise<PluginCategory> {
  const response = await apiClient.get<PluginCategory>(
    `/api/admin/plugin-categories/${categoryId}/`,
  )
  return response.data
}

export async function createAdminPluginCategory(
  payload: PluginCategoryCreatePayload,
): Promise<PluginCategory> {
  const response = await apiClient.post<PluginCategory>(
    '/api/admin/plugin-categories/',
    payload,
  )
  return response.data
}

export async function updateAdminPluginCategory(
  categoryId: string,
  payload: PluginCategoryUpdatePayload,
): Promise<PluginCategory> {
  const response = await apiClient.patch<PluginCategory>(
    `/api/admin/plugin-categories/${categoryId}/`,
    payload,
  )
  return response.data
}

export async function deactivateAdminPluginCategory(
  categoryId: string,
): Promise<PluginCategory> {
  const response = await apiClient.delete<PluginCategory>(
    `/api/admin/plugin-categories/${categoryId}/`,
  )
  return response.data
}

export async function uploadPluginImage(
  pluginId: string,
  payload: PluginImageUploadPayload,
): Promise<PluginImage> {
  const formData = new FormData()
  formData.append('image', payload.image)
  formData.append('display_order', String(payload.display_order ?? 0))
  formData.append('is_primary', String(payload.is_primary ?? false))
  const response = await apiClient.post<PluginImage>(
    `/api/admin/plugins/${pluginId}/images/`,
    formData,
  )
  return response.data
}

export async function deletePluginImage(pluginId: string, imageId: string): Promise<void> {
  await apiClient.delete(`/api/admin/plugins/${pluginId}/images/${imageId}/`)
}

export async function uploadPluginFile(
  pluginId: string,
  payload: PluginFileUploadPayload,
): Promise<PluginFile> {
  const formData = new FormData()
  formData.append('file', payload.file)
  formData.append('version', payload.version ?? '1.0')
  formData.append('is_primary', String(payload.is_primary ?? false))
  const response = await apiClient.post<PluginFile>(
    `/api/admin/plugins/${pluginId}/files/`,
    formData,
  )
  return response.data
}

export async function deletePluginFile(pluginId: string, fileId: string): Promise<void> {
  await apiClient.delete(`/api/admin/plugins/${pluginId}/files/${fileId}/`)
}
