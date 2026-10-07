import { apiClient, refreshSessionAccessToken } from './client'
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
  const response = await apiClient.post<RegisteredUser>('/api/v1/auth/register/', payload)
  return response.data
}

export async function loginUser(payload: LoginPayload): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/api/v1/auth/login/', payload)
  return response.data
}

export async function loginWithGoogle(
  idToken: string,
  rememberMe = true,
): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/api/v1/auth/google/', {
    id_token: idToken,
    remember_me: rememberMe,
  })
  return response.data
}

export async function adminLoginUser(payload: LoginPayload): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/api/v1/auth/admin/login/', {
    ...payload,
    remember_me: payload.remember_me ?? true,
  })
  return response.data
}

export async function refreshAccessToken(): Promise<RefreshResponse> {
  const access = await refreshSessionAccessToken()
  return { access }
}

export async function getCurrentUser(): Promise<AuthUser> {
  const response = await apiClient.get<AuthUser>('/api/v1/auth/me/')
  return response.data
}

export async function getAdminCurrentUser(): Promise<AuthUser> {
  const response = await apiClient.get<AuthUser>('/api/v1/auth/admin/me/')
  return response.data
}

export async function logoutUser(): Promise<void> {
  await apiClient.post('/api/v1/auth/logout/', {})
}

export async function getProfile(): Promise<UserProfile> {
  const response = await apiClient.get<UserProfile>('/api/v1/auth/profile/')
  return response.data
}

export async function updateProfile(payload: ProfileUpdatePayload): Promise<UserProfile> {
  const response = await apiClient.patch<UserProfile>('/api/v1/auth/profile/', payload)
  return response.data
}

export async function uploadAvatar(file: File): Promise<UserProfile> {
  const formData = new FormData()
  formData.append('avatar', file)
  const response = await apiClient.post<UserProfile>('/api/v1/auth/profile/avatar/', formData)
  return response.data
}

export async function deleteAvatar(): Promise<UserProfile> {
  const response = await apiClient.delete<UserProfile>('/api/v1/auth/profile/avatar/')
  return response.data
}

export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await apiClient.post('/api/v1/auth/change-password/', payload)
}

export async function requestPasswordReset(
  payload: PasswordResetRequestPayload,
): Promise<{ detail: string }> {
  const response = await apiClient.post<{ detail: string }>(
    '/api/v1/auth/password-reset/',
    payload,
  )
  return response.data
}

export async function confirmPasswordReset(
  payload: PasswordResetConfirmPayload,
): Promise<{ detail: string }> {
  const response = await apiClient.post<{ detail: string }>(
    '/api/v1/auth/password-reset/confirm/',
    payload,
  )
  return response.data
}

export async function resendEmailVerification(
  payload: EmailVerificationResendPayload,
): Promise<{ detail: string }> {
  const response = await apiClient.post<{ detail: string }>(
    '/api/v1/auth/email-verification/resend/',
    payload,
  )
  return response.data
}

export async function confirmEmailVerification(
  payload: EmailVerificationConfirmPayload,
): Promise<{ detail: string }> {
  const response = await apiClient.post<{ detail: string }>(
    '/api/v1/auth/email-verification/confirm/',
    payload,
  )
  return response.data
}

export async function listAdminUsers(
  params: AdminUserListParams = {},
): Promise<PaginatedAdminUsers> {
  const response = await apiClient.get<PaginatedAdminUsers>('/api/v1/auth/admin/users/', {
    params,
  })
  return response.data
}

export async function getAdminUser(userId: string): Promise<AdminUser> {
  const response = await apiClient.get<AdminUser>(`/api/v1/auth/admin/users/${userId}/`)
  return response.data
}

export async function createAdminUser(payload: AdminUserCreatePayload): Promise<AdminUser> {
  const response = await apiClient.post<AdminUser>('/api/v1/auth/admin/users/', payload)
  return response.data
}

export async function updateAdminUser(
  userId: string,
  payload: AdminUserUpdatePayload,
): Promise<AdminUser> {
  const response = await apiClient.patch<AdminUser>(
    `/api/v1/auth/admin/users/${userId}/`,
    payload,
  )
  return response.data
}

export async function deactivateAdminUser(userId: string): Promise<AdminUser> {
  const response = await apiClient.delete<AdminUser>(`/api/v1/auth/admin/users/${userId}/`)
  return response.data
}
