import { useMemo } from 'react'
import type { QueryKey } from '@tanstack/react-query'

import {
  createAdminProjectMessage,
  downloadAdminProjectMessageAttachment,
  listAdminProjectMessages,
  markAdminProjectMessagesRead,
} from '../../api/customProjectsApi'
import {
  ProjectMessagesPanel,
  type ProjectMessagesPanelAdapters,
} from '../../components/projects/ProjectMessagesPanel'
import { resolveAdminMessageSenderLabel } from '../../lib/projectMessages'
import { useAuthStore } from '../../store/authStore'

interface AdminProjectMessagesSectionProps {
  projectId: string
  customerId: string
}

export function AdminProjectMessagesSection({
  projectId,
  customerId,
}: AdminProjectMessagesSectionProps) {
  const currentUserId = useAuthStore((state) => state.user?.id)

  const adapters = useMemo<ProjectMessagesPanelAdapters>(
    () => ({
      listMessages: listAdminProjectMessages,
      createMessage: createAdminProjectMessage,
      downloadAttachment: downloadAdminProjectMessageAttachment,
      markRead: markAdminProjectMessagesRead,
      messagesQueryKey: ['admin', 'custom-projects', projectId, 'messages'],
      invalidateAfterMarkRead: (queryKey: QueryKey) => {
        const [scope, resource, third] = queryKey
        return (
          scope === 'admin' &&
          resource === 'custom-projects' &&
          typeof third === 'object' &&
          third !== null
        )
      },
      resolveSenderLabel: (message) =>
        resolveAdminMessageSenderLabel(message, currentUserId, customerId),
    }),
    [customerId, currentUserId, projectId],
  )

  return (
    <ProjectMessagesPanel
      projectId={projectId}
      adapters={adapters}
      sectionClassName="admin-media-section admin-project-messages"
      titleId="admin-project-messages-title"
      hint={
        <p className="admin-project-messages__hint">
          Shared with the customer. Separate from internal Admin notes above.
        </p>
      }
      composerLabel="Reply to customer"
      composerPlaceholder="Send a reply the customer can see…"
      submitLabel="Send reply"
      bodyFieldId="admin-project-message-body"
      attachmentFieldId="admin-project-message-attachment"
      sendErrorFallback="Could not send your reply. Please try again."
    />
  )
}
