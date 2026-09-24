import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '../../api/authApi'
import { createTestQueryClient, resetAuthStore, testUser } from '../../test/test-utils'
import type { UserProfile } from '../../types/auth'
import { ProfilePage } from './ProfilePage'

const testProfile: UserProfile = {
  id: testUser.id,
  full_name: testUser.full_name,
  email: testUser.email,
  phone: testUser.phone,
  role: testUser.role,
  avatar: '',
  company_name: '',
  website: '',
  address: '',
  city: '',
  country: 'India',
  created_at: testUser.created_at,
  updated_at: testUser.created_at,
}

function renderProfilePage() {
  const queryClient = createTestQueryClient()

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  vi.restoreAllMocks()
})

describe('ProfilePage', () => {
  it('loads profile fields and saves updates', async () => {
    const user = userEvent.setup()
    const getProfile = vi.spyOn(authApi, 'getProfile').mockResolvedValue(testProfile)
    const updateProfile = vi
      .spyOn(authApi, 'updateProfile')
      .mockResolvedValue({
        ...testProfile,
        company_name: 'Acme Studios',
        city: 'Mumbai',
        website: 'https://acme.example.com',
      })

    renderProfilePage()

    expect(await screen.findByDisplayValue('India')).toBeInTheDocument()
    expect(getProfile).toHaveBeenCalled()

    await user.clear(screen.getByLabelText(/company/i))
    await user.type(screen.getByLabelText(/company/i), 'Acme Studios')
    await user.clear(screen.getByLabelText(/city/i))
    await user.type(screen.getByLabelText(/city/i), 'Mumbai')
    await user.clear(screen.getByLabelText(/website/i))
    await user.type(screen.getByLabelText(/website/i), 'https://acme.example.com')

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalled()
    })

    expect(updateProfile.mock.calls[0][0]).toEqual({
      company_name: 'Acme Studios',
      website: 'https://acme.example.com',
      address: '',
      city: 'Mumbai',
      country: 'India',
    })
  })

  it('renders profile sections matching the edit-profile layout', async () => {
    vi.spyOn(authApi, 'getProfile').mockResolvedValue(testProfile)
    renderProfilePage()

    expect(
      await screen.findByRole('heading', { name: /profile information/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /edit your personal profile/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^links$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /change password/i })).toBeInTheDocument()
    expect(screen.getByDisplayValue(testProfile.full_name)).toBeInTheDocument()
    expect(screen.getByLabelText(/personal website/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^username$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /update password/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })

  it('submits the change-password form from the profile page', async () => {
    const user = userEvent.setup()
    vi.spyOn(authApi, 'getProfile').mockResolvedValue(testProfile)
    const changePassword = vi.spyOn(authApi, 'changePassword').mockResolvedValue(undefined)

    renderProfilePage()

    await screen.findByRole('heading', { name: /change password/i })

    await user.type(screen.getByLabelText(/current password/i), 'OldPass123!')
    await user.type(screen.getByLabelText(/^new password$/i), 'NewPass123!')
    await user.type(screen.getByLabelText(/confirm password/i), 'NewPass123!')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalled()
    })
    expect(changePassword.mock.calls[0]?.[0]).toEqual({
      current_password: 'OldPass123!',
      new_password: 'NewPass123!',
      new_password_confirm: 'NewPass123!',
    })
  })

  it('shows an error state when profile loading fails', async () => {
    vi.spyOn(authApi, 'getProfile').mockRejectedValue(new Error('network'))

    renderProfilePage()

    expect(
      await screen.findByRole('heading', { name: /could not load your profile/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
