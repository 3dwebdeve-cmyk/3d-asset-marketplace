import { apiClient } from './client'
import type {
  LoginPayload,
  LoginResponse,
  RefreshResponse,
  RegisterPayload,
  RegisteredUser,
} from '../types/auth'

export async function registerUser(payload: RegisterPayload): Promise<RegisteredUser> {
  const response = await apiClient.post<RegisteredUser>('/api/auth/register/', payload)
  return response.data
}

export async function loginUser(payload: LoginPayload): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/api/auth/login/', payload)
  return response.data
}

export async function refreshAccessToken(refresh: string): Promise<RefreshResponse> {
  const response = await apiClient.post<RefreshResponse>('/api/auth/token/refresh/', {
    refresh,
  })
  return response.data
}
