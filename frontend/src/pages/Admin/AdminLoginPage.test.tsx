import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { AxiosError, type AxiosResponse } from 'axios'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '../../api/authApi'
import { useAuthStore } from '../../store/authStore'
import { createTestQueryClient, resetAuthStore, resetToastStore, testUser } from '../../test/test-utils'
import { AdminLoginPage } from './AdminLoginPage'

vi.mock('../../api/authApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/authApi')>('../../api/authApi')
  return {
    ...actual,
    adminLoginUser: vi.fn(),
    adminMfaSetup: vi.fn(),
    adminMfaConfirm: vi.fn(),
    adminMfaVerify: vi.fn(),
  }
})

function renderAdminLogin() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/console/login']}>
        <Routes>
          <Route path="/console/login" element={<AdminLoginPage />} />
          <Route path="/console" element={<div>Admin Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const adminUser = { ...testUser, role: 'Administrator', email: 'admin@example.com' }

async function submitPassword(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/email address/i), 'admin@example.com')
  await user.type(screen.getByLabelText(/^password$/i), 'StrongPass123!')
  await user.click(screen.getByRole('button', { name: /sign in/i }))
}

function apiError(status: number, data: Record<string, string>): AxiosError {
  const error = new AxiosError('Request failed')
  error.response = { status, data, statusText: '', headers: {}, config: {} } as AxiosResponse
  return error
}

beforeEach(() => {
  resetAuthStore()
  resetToastStore()
  vi.clearAllMocks()
})

describe('AdminLoginPage', () => {
  it('renders email and password fields only', () => {
    renderAdminLogin()

    expect(screen.getByRole('heading', { name: /admin sign in/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /register/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /forgot password/i })).not.toBeInTheDocument()
  })

  it('redirects administrators who are already signed in', () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      user: { ...testUser, role: 'Administrator', email: 'admin@example.com' },
      isAuthenticated: true,
    })

    renderAdminLogin()

    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()
  })

  it('signs in administrators and navigates to /console', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.adminLoginUser).mockResolvedValue({
      access: 'access-token',
      user: { ...testUser, role: 'Administrator', email: 'admin@example.com' },
    })

    renderAdminLogin()

    await user.type(screen.getByLabelText(/email address/i), 'admin@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'StrongPass123!')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()
    })
    expect(authApi.adminLoginUser).toHaveBeenCalled()
    expect(vi.mocked(authApi.adminLoginUser).mock.calls[0]?.[0]).toEqual({
      email: 'admin@example.com',
      password: 'StrongPass123!',
      remember_me: true,
    })
  })

  it('asks for the authenticator code before creating a session', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.adminLoginUser).mockResolvedValue({
      mfa_required: true,
      setup_required: false,
      mfa_token: 'mfa-token',
    })
    vi.mocked(authApi.adminMfaVerify).mockResolvedValue({ access: 'access-token', user: adminUser })

    renderAdminLogin()
    await submitPassword(user)

    expect(await screen.findByRole('heading', { name: /two-factor sign-in/i })).toBeInTheDocument()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)

    await user.type(screen.getByLabelText(/6-digit code/i), '123456')
    await user.click(screen.getByRole('button', { name: /^verify$/i }))

    await waitFor(() => expect(screen.getByText('Admin Dashboard')).toBeInTheDocument())
    expect(authApi.adminMfaVerify).toHaveBeenCalledWith({
      mfa_token: 'mfa-token',
      remember_me: true,
      code: '123456',
    })
    expect(useAuthStore.getState().accessToken).toBe('access-token')
  })

  it('accepts a recovery code instead of an authenticator code', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.adminLoginUser).mockResolvedValue({
      mfa_required: true,
      setup_required: false,
      mfa_token: 'mfa-token',
    })
    vi.mocked(authApi.adminMfaVerify).mockResolvedValue({ access: 'access-token', user: adminUser })

    renderAdminLogin()
    await submitPassword(user)
    await user.click(await screen.findByRole('button', { name: /use a recovery code instead/i }))
    await user.type(screen.getByLabelText(/recovery code/i), 'ABCDE-FGHJK')
    await user.click(screen.getByRole('button', { name: /^verify$/i }))

    await waitFor(() => expect(screen.getByText('Admin Dashboard')).toBeInTheDocument())
    expect(vi.mocked(authApi.adminMfaVerify).mock.calls[0]?.[0]).toMatchObject({
      recovery_code: 'ABCDE-FGHJK',
    })
  })

  it('shows a wrong-code error and stays on the code step', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.adminLoginUser).mockResolvedValue({
      mfa_required: true,
      setup_required: false,
      mfa_token: 'mfa-token',
    })
    vi.mocked(authApi.adminMfaVerify).mockRejectedValue(
      apiError(400, { detail: 'That code is not valid.', code: 'mfa_invalid' }),
    )

    renderAdminLogin()
    await submitPassword(user)
    await user.type(await screen.findByLabelText(/6-digit code/i), '000000')
    await user.click(screen.getByRole('button', { name: /^verify$/i }))

    expect(await screen.findByText('That code is not valid.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /two-factor sign-in/i })).toBeInTheDocument()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('returns to the password form when the sign-in expired', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.adminLoginUser).mockResolvedValue({
      mfa_required: true,
      setup_required: false,
      mfa_token: 'mfa-token',
    })
    vi.mocked(authApi.adminMfaVerify).mockRejectedValue(
      apiError(400, { detail: 'expired', code: 'mfa_expired' }),
    )

    renderAdminLogin()
    await submitPassword(user)
    await user.type(await screen.findByLabelText(/6-digit code/i), '123456')
    await user.click(screen.getByRole('button', { name: /^verify$/i }))

    expect(await screen.findByRole('heading', { name: /admin sign in/i })).toBeInTheDocument()
    expect(screen.getByText(/your sign-in expired/i)).toBeInTheDocument()
  })

  it('sets up the authenticator and shows recovery codes once', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.adminLoginUser).mockResolvedValue({
      mfa_required: true,
      setup_required: true,
      mfa_token: 'mfa-token',
    })
    vi.mocked(authApi.adminMfaSetup).mockResolvedValue({
      secret: 'JBSWY3DPEHPK3PXP',
      otpauth_uri: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP',
    })
    vi.mocked(authApi.adminMfaConfirm).mockResolvedValue({
      access: 'access-token',
      user: adminUser,
      recovery_codes: ['AAAAA-BBBBB', 'CCCCC-DDDDD'],
    })

    renderAdminLogin()
    await submitPassword(user)

    expect(await screen.findByText('JBSW Y3DP EHPK 3PXP')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/6-digit code/i), '123456')
    await user.click(screen.getByRole('button', { name: /turn on two-factor sign-in/i }))

    expect(await screen.findByText('AAAAA-BBBBB')).toBeInTheDocument()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    await user.click(screen.getByRole('button', { name: /i have saved these codes/i }))

    await waitFor(() => expect(screen.getByText('Admin Dashboard')).toBeInTheDocument())
    expect(authApi.adminMfaConfirm).toHaveBeenCalledWith('mfa-token', '123456', true)
  })
})
