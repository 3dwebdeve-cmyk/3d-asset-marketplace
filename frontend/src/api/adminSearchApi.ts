import { apiClient } from './client'

export interface AdminSearchResult {
  id: string
  label: string
  detail: string
}

export type AdminSearchResults = Record<'products' | 'plugins' | 'users' | 'orders', AdminSearchResult[]>

export async function searchAdmin(q: string, signal?: AbortSignal): Promise<AdminSearchResults> {
  const response = await apiClient.get<AdminSearchResults>('/api/v1/admin/search/', {
    params: { q }, signal,
  })
  return response.data
}
