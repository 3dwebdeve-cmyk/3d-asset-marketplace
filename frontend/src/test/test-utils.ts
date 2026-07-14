import { QueryClient } from '@tanstack/react-query'

import { useAuthStore } from '../store/authStore'
import { useToastStore } from '../store/toastStore'
import type { AuthUser } from '../types/auth'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })
}

export function resetAuthStore(): void {
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    isAuthenticated: false,
  })
  localStorage.clear()
}

export function resetToastStore(): void {
  useToastStore.setState({ toasts: [] })
}

export const testUser: AuthUser = {
  id: '11111111-1111-1111-1111-111111111111',
  full_name: 'Test User',
  email: 'test@example.com',
  phone: '',
  country: 'India',
  role: 'Customer',
  email_verified: false,
  created_at: '2024-01-01T00:00:00Z',
}
