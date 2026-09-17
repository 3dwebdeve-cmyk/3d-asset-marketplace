export interface RegisterPayload {
  full_name: string
  email: string
  password: string
  password_confirm: string
  phone?: string
  country?: string
}

export interface RegisteredUser {
  id: string
  full_name: string
  email: string
  phone: string
  country: string
  avatar?: string
  role: string
  email_verified: boolean
  created_at: string
}

export type AuthUser = RegisteredUser

export interface LoginPayload {
  email: string
  password: string
  remember_me?: boolean
}

export interface LoginResponse {
  access: string
  user: AuthUser
}

export interface RefreshResponse {
  access: string
}

export interface ApiFieldErrors {
  [field: string]: string[]
}

export interface ApiErrorResponse {
  detail?: string
  code?: string
  [field: string]: string | string[] | undefined
}

export interface UserProfile {
  id: string
  full_name: string
  email: string
  phone: string
  role: string
  avatar: string
  company_name: string
  website: string
  address: string
  city: string
  country: string
  created_at: string
  updated_at: string
}

export interface ProfileUpdatePayload {
  company_name?: string
  website?: string
  address?: string
  city?: string
  country?: string
}

export interface ChangePasswordPayload {
  current_password: string
  new_password: string
  new_password_confirm: string
}

export interface PasswordResetRequestPayload {
  email: string
}

export interface PasswordResetConfirmPayload {
  uid: string
  token: string
  new_password: string
  new_password_confirm: string
}

export interface EmailVerificationResendPayload {
  email: string
}

export interface EmailVerificationConfirmPayload {
  uid: string
  token: string
}

export interface AdminUser {
  id: string
  full_name: string
  email: string
  phone: string
  country: string
  avatar: string
  role: string
  email_verified: boolean
  is_active: boolean
  is_staff: boolean
  created_at: string
  updated_at: string
}

export interface AdminUserCreatePayload {
  full_name: string
  email: string
  password: string
  password_confirm: string
  role: 'Customer' | 'Administrator'
  phone?: string
  country?: string
}

export interface AdminUserUpdatePayload {
  full_name?: string
  phone?: string
  country?: string
  role?: 'Customer' | 'Administrator'
  is_active?: boolean
  email_verified?: boolean
}

export interface PaginatedAdminUsers {
  count: number
  next: string | null
  previous: string | null
  results: AdminUser[]
}

export interface AdminUserListParams {
  page?: number
  page_size?: number
  role?: string
  is_active?: boolean
  search?: string
}
