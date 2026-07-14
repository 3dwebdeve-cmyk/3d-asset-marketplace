import { apiClient } from './client'
import type { RegisterPayload, RegisteredUser } from '../types/auth'

export async function registerUser(payload: RegisterPayload): Promise<RegisteredUser> {
  const response = await apiClient.post<RegisteredUser>('/api/auth/register/', payload)
  return response.data
}
