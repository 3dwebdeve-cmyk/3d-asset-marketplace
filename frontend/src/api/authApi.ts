import { apiClient } from './client'
import type {
  AdminUser,
  AdminUserCreatePayload,
  AdminUserListParams,
  AdminUserUpdatePayload,
  AuthUser,
  ChangePasswordPayload,
  LoginPayload,
  LoginResponse,
  PaginatedAdminUsers,
  PasswordResetConfirmPayload,
  PasswordResetRequestPayload,
  EmailVerificationConfirmPayload,
  EmailVerificationResendPayload,
  ProfileUpdatePayload,
  RefreshResponse,
  RegisterPayload,
  RegisteredUser,
  UserProfile,
} from '../types/auth'

export async function registerUser(payload: RegisterPayload): Promise<RegisteredUser> {
  const response = await apiClient.post<RegisteredUser>('/api/auth/register/', payload)
  return response.data
}

export async function loginUser(payload: LoginPayload): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/api/auth/login/', payload)
  return response.data
}

export async function adminLoginUser(payload: LoginPayload): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/api/auth/admin/login/', payload)
  return response.data
}

export async function refreshAccessToken(refresh: string): Promise<RefreshResponse> {
  const response = await apiClient.post<RefreshResponse>('/api/auth/token/refresh/', {
    refresh,
  })
  return response.data
}

export async function getCurrentUser(): Promise<AuthUser> {
  const response = await apiClient.get<AuthUser>('/api/auth/me/')
  return response.data
}

export async function getAdminCurrentUser(): Promise<AuthUser> {
  const response = await apiClient.get<AuthUser>('/api/auth/admin/me/')
  return response.data
}

export async function logoutUser(refresh: string): Promise<void> {
  await apiClient.post('/api/auth/logout/', { refresh })
}

export async function getProfile(): Promise<UserProfile> {
  const response = await apiClient.get<UserProfile>('/api/auth/profile/')
  return response.data
}

export async function updateProfile(payload: ProfileUpdatePayload): Promise<UserProfile> {
  const response = await apiClient.patch<UserProfile>('/api/auth/profile/', payload)
  return response.data
}

export async function uploadAvatar(file: File): Promise<UserProfile> {
  const formData = new FormData()
  formData.append('avatar', file)
  const response = await apiClient.post<UserProfile>('/api/auth/profile/avatar/', formData)
  return response.data
}

export async function deleteAvatar(): Promise<UserProfile> {
  const response = await apiClient.delete<UserProfile>('/api/auth/profile/avatar/')
  return response.data
}

export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await apiClient.post('/api/auth/change-password/', payload)
}

export async function requestPasswordReset(
  payload: PasswordResetRequestPayload,
): Promise<{ detail: string }> {
  const response = await apiClient.post<{ detail: string }>(
    '/api/auth/password-reset/',
    payload,
  )
  return response.data
}

export async function confirmPasswordReset(
  payload: PasswordResetConfirmPayload,
): Promise<{ detail: string }> {
  const response = await apiClient.post<{ detail: string }>(
    '/api/auth/password-reset/confirm/',
    payload,
  )
  return response.data
}

export async function resendEmailVerification(
  payload: EmailVerificationResendPayload,
): Promise<{ detail: string }> {
  const response = await apiClient.post<{ detail: string }>(
    '/api/auth/email-verification/resend/',
    payload,
  )
  return response.data
}

export async function confirmEmailVerification(
  payload: EmailVerificationConfirmPayload,
): Promise<{ detail: string }> {
  const response = await apiClient.post<{ detail: string }>(
    '/api/auth/email-verification/confirm/',
    payload,
  )
  return response.data
}

export async function listAdminUsers(
  params: AdminUserListParams = {},
): Promise<PaginatedAdminUsers> {
  const response = await apiClient.get<PaginatedAdminUsers>('/api/auth/admin/users/', {
    params,
  })
  return response.data
}

export async function getAdminUser(userId: string): Promise<AdminUser> {
  const response = await apiClient.get<AdminUser>(`/api/auth/admin/users/${userId}/`)
  return response.data
}

export async function createAdminUser(payload: AdminUserCreatePayload): Promise<AdminUser> {
  const response = await apiClient.post<AdminUser>('/api/auth/admin/users/', payload)
  return response.data
}

export async function updateAdminUser(
  userId: string,
  payload: AdminUserUpdatePayload,
): Promise<AdminUser> {
  const response = await apiClient.patch<AdminUser>(
    `/api/auth/admin/users/${userId}/`,
    payload,
  )
  return response.data
}

export async function deactivateAdminUser(userId: string): Promise<AdminUser> {
  const response = await apiClient.delete<AdminUser>(`/api/auth/admin/users/${userId}/`)
  return response.data
}
