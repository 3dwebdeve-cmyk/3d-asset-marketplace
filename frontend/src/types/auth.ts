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
  role: string
  email_verified: boolean
  created_at: string
}

export interface ApiFieldErrors {
  [field: string]: string[]
}

export interface ApiErrorResponse {
  detail?: string
  [field: string]: string | string[] | undefined
}
