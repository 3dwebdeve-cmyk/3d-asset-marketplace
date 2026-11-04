import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as pluginsApi from '../../api/pluginsApi'
import type { AdminPlugin } from '../../types/plugin'
import { createTestQueryClient, resetToastStore } from '../../test/test-utils'
import { PluginReviewPanel } from './PluginReviewPanel'

vi.mock('../../api/pluginsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/pluginsApi')>(
    '../../api/pluginsApi',
  )
  return {
    ...actual,
    approveAdminPlugin: vi.fn(),
    rejectAdminPlugin: vi.fn(),
    requeueAdminPlugin: vi.fn(),
  }
})

const basePlugin = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Rig Helper',
  slug: 'rig-helper',
  plugin_id: 'PLG-ANI-000001',
  status: 'pending_review',
  reject_reason: '',
  qa_notes: '',
} as unknown as AdminPlugin

function renderPanel(plugin: AdminPlugin) {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <PluginReviewPanel plugin={plugin} />
    </QueryClientProvider>,
  )
}

describe('PluginReviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetToastStore()
  })

  it('renders nothing for a published plugin', () => {
    const { container } = renderPanel({ ...basePlugin, status: 'published' } as AdminPlugin)
    expect(container).toBeEmptyDOMElement()
  })

  it('approves a pending plugin with the price the reviewer enters', async () => {
    vi.mocked(pluginsApi.approveAdminPlugin).mockResolvedValue({ ...basePlugin, status: 'published' } as AdminPlugin)
    const user = userEvent.setup()
    renderPanel(basePlugin)

    await user.type(screen.getByLabelText('Price (0 = free)'), '24.50')
    await user.click(screen.getByRole('button', { name: /approve and publish/i }))

    await waitFor(() =>
      expect(pluginsApi.approveAdminPlugin).toHaveBeenCalledWith(
        basePlugin.id,
        expect.objectContaining({ price: '24.50' }),
      ),
    )
  })

  it('refuses to approve without a valid price', async () => {
    const user = userEvent.setup()
    renderPanel(basePlugin)

    await user.type(screen.getByLabelText('Price (0 = free)'), 'abc')
    await user.click(screen.getByRole('button', { name: /approve and publish/i }))

    expect(pluginsApi.approveAdminPlugin).not.toHaveBeenCalled()
    expect(await screen.findByText(/enter a price/i)).toBeInTheDocument()
  })

  it('will not reject without a reason', async () => {
    const user = userEvent.setup()
    renderPanel(basePlugin)

    await user.click(screen.getByRole('button', { name: /^reject$/i }))

    expect(pluginsApi.rejectAdminPlugin).not.toHaveBeenCalled()
    expect(await screen.findByText(/enter the reason/i)).toBeInTheDocument()
  })

  it('shows the rejection reason and can send a rejected plugin back to review', async () => {
    vi.mocked(pluginsApi.requeueAdminPlugin).mockResolvedValue({ ...basePlugin, status: 'pending_review' } as AdminPlugin)
    const user = userEvent.setup()
    renderPanel({ ...basePlugin, status: 'rejected', reject_reason: 'Thumbnail is blurry' } as AdminPlugin)

    expect(screen.getByText('Thumbnail is blurry')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /send back to review/i }))

    await waitFor(() => expect(pluginsApi.requeueAdminPlugin).toHaveBeenCalledWith(basePlugin.id))
  })
})
