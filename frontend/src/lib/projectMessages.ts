import type {
  PaginatedProjectMessages,
  ProjectMessage,
  ProjectMessageListParams,
} from '../types/customProject'

export const PROJECT_MESSAGE_PAGE_SIZE = 100

export type ProjectMessageListFn = (
  projectId: string,
  params?: ProjectMessageListParams,
) => Promise<PaginatedProjectMessages>

export interface LatestProjectMessages {
  messages: ProjectMessage[]
  count: number
  truncated: boolean
}

/** Chronological latest window of messages (handles threads longer than one page). */
export async function fetchLatestProjectMessages(
  listFn: ProjectMessageListFn,
  projectId: string,
  pageSize: number = PROJECT_MESSAGE_PAGE_SIZE,
): Promise<LatestProjectMessages> {
  const safePageSize = Math.max(1, pageSize)
  const firstPage = await listFn(projectId, { page: 1, page_size: safePageSize })

  if (!firstPage.next || firstPage.count <= safePageSize) {
    return {
      messages: firstPage.results,
      count: firstPage.count,
      truncated: false,
    }
  }

  const startIndex = Math.max(0, firstPage.count - safePageSize)
  const startPage = Math.floor(startIndex / safePageSize) + 1
  const lastPage = Math.ceil(firstPage.count / safePageSize)
  const collected: ProjectMessage[] = []

  for (let page = startPage; page <= lastPage; page += 1) {
    if (page === 1) {
      collected.push(...firstPage.results)
      continue
    }
    const pageData = await listFn(projectId, { page, page_size: safePageSize })
    collected.push(...pageData.results)
  }

  const offsetInStartPage = startIndex % safePageSize
  return {
    messages: collected.slice(offsetInStartPage, offsetInStartPage + safePageSize),
    count: firstPage.count,
    truncated: true,
  }
}

export function resolveCustomerMessageSenderLabel(
  message: ProjectMessage,
  currentUserId: string | undefined,
): string {
  if (currentUserId && message.sender.id === currentUserId) {
    return 'You'
  }
  return 'Studio'
}

export function resolveAdminMessageSenderLabel(
  message: ProjectMessage,
  currentUserId: string | undefined,
  customerId: string | undefined,
): string {
  if (currentUserId && message.sender.id === currentUserId) {
    return 'You'
  }
  if (customerId && message.sender.id === customerId) {
    return 'Customer'
  }
  const name = message.sender.full_name.trim()
  return name || 'Studio'
}
