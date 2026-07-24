import { describe, expect, it, vi } from 'vitest'

import {
  fetchLatestProjectMessages,
  PROJECT_MESSAGE_PAGE_SIZE,
  resolveAdminMessageSenderLabel,
  resolveCustomerMessageSenderLabel,
} from './projectMessages'
import type { PaginatedProjectMessages, ProjectMessage } from '../types/customProject'

function message(
  id: string,
  senderId: string,
  body: string,
  fullName = 'Sender',
): ProjectMessage {
  return {
    id,
    project_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    body,
    sender: { id: senderId, full_name: fullName },
    attachments: [],
    created_at: `2026-01-01T00:00:${id.padStart(2, '0')}Z`,
    updated_at: `2026-01-01T00:00:${id.padStart(2, '0')}Z`,
  }
}

describe('resolveCustomerMessageSenderLabel', () => {
  it('labels the current user as You and everyone else as Studio', () => {
    const own = message('1', 'user-1', 'Mine')
    const other = message('2', 'admin-1', 'Reply')
    expect(resolveCustomerMessageSenderLabel(own, 'user-1')).toBe('You')
    expect(resolveCustomerMessageSenderLabel(other, 'user-1')).toBe('Studio')
    expect(resolveCustomerMessageSenderLabel(own, undefined)).toBe('Studio')
  })
})

describe('resolveAdminMessageSenderLabel', () => {
  it('labels current admin as You and project customer as Customer', () => {
    const own = message('1', 'admin-1', 'Studio reply', 'Admin One')
    const customer = message('2', 'customer-1', 'Question', 'Ada')
    expect(resolveAdminMessageSenderLabel(own, 'admin-1', 'customer-1')).toBe('You')
    expect(resolveAdminMessageSenderLabel(customer, 'admin-1', 'customer-1')).toBe(
      'Customer',
    )
  })

  it('does not mislabel another admin as Customer', () => {
    const otherAdmin = message('3', 'admin-2', 'Also from studio', 'Admin Two')
    expect(resolveAdminMessageSenderLabel(otherAdmin, 'admin-1', 'customer-1')).toBe(
      'Admin Two',
    )
  })

  it('falls back to Studio when another sender has a blank name', () => {
    const blank = message('4', 'admin-2', 'Hello', '   ')
    expect(resolveAdminMessageSenderLabel(blank, 'admin-1', 'customer-1')).toBe('Studio')
  })
})

describe('fetchLatestProjectMessages', () => {
  it('returns a single page unchanged when the thread fits', async () => {
    const listFn = vi.fn(async (): Promise<PaginatedProjectMessages> => ({
      count: 2,
      next: null,
      previous: null,
      results: [message('01', 'a', 'first'), message('02', 'b', 'second')],
    }))

    const result = await fetchLatestProjectMessages(listFn, 'project-1', 100)

    expect(listFn).toHaveBeenCalledTimes(1)
    expect(result.truncated).toBe(false)
    expect(result.messages.map((item) => item.body)).toEqual(['first', 'second'])
  })

  it('loads the latest window when count exceeds page size (not only page 1)', async () => {
    const pageSize = 100
    const total = 101
    const all = Array.from({ length: total }, (_, index) =>
      message(String(index + 1).padStart(2, '0'), 'a', `msg-${index + 1}`),
    )

    const listFn = vi.fn(
      async (
        _projectId: string,
        params?: { page?: number; page_size?: number },
      ): Promise<PaginatedProjectMessages> => {
        const page = params?.page ?? 1
        const size = params?.page_size ?? pageSize
        const start = (page - 1) * size
        const results = all.slice(start, start + size)
        const hasNext = start + size < total
        return {
          count: total,
          next: hasNext ? 'next' : null,
          previous: page > 1 ? 'prev' : null,
          results,
        }
      },
    )

    const result = await fetchLatestProjectMessages(listFn, 'project-1', pageSize)

    expect(result.truncated).toBe(true)
    expect(result.count).toBe(101)
    expect(result.messages).toHaveLength(100)
    expect(result.messages[0]?.body).toBe('msg-2')
    expect(result.messages[99]?.body).toBe('msg-101')
    expect(listFn).toHaveBeenCalledWith('project-1', { page: 1, page_size: 100 })
    expect(listFn).toHaveBeenCalledWith('project-1', { page: 2, page_size: 100 })
  })

  it('does not crash and still returns newest messages across mid-thread pages', async () => {
    const pageSize = 100
    const total = 250
    const all = Array.from({ length: total }, (_, index) =>
      message(String(index + 1), 'a', `msg-${index + 1}`),
    )
    const listFn = vi.fn(
      async (
        _projectId: string,
        params?: { page?: number; page_size?: number },
      ): Promise<PaginatedProjectMessages> => {
        const page = params?.page ?? 1
        const size = params?.page_size ?? pageSize
        const start = (page - 1) * size
        return {
          count: total,
          next: start + size < total ? 'next' : null,
          previous: page > 1 ? 'prev' : null,
          results: all.slice(start, start + size),
        }
      },
    )

    const result = await fetchLatestProjectMessages(listFn, 'project-1', pageSize)

    expect(result.messages).toHaveLength(100)
    expect(result.messages[0]?.body).toBe('msg-151')
    expect(result.messages[99]?.body).toBe('msg-250')
    expect(listFn.mock.calls.map((call) => call[1]?.page)).toEqual([1, 2, 3])
  })

  it('uses the shared default page size constant', () => {
    expect(PROJECT_MESSAGE_PAGE_SIZE).toBe(100)
  })
})
