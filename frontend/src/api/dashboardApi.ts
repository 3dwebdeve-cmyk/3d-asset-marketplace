import { apiClient } from './client'
import type { AdminDashboardStats } from '../types/dashboard'

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const response = await apiClient.get<AdminDashboardStats>('/api/admin/dashboard/stats/')
  return response.data
}
