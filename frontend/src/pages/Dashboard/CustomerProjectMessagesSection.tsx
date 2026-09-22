import { useMemo } from 'react'
import type { QueryKey } from '@tanstack/react-query'

import {
  createCustomerProjectMessage,
  downloadCustomerProjectMessageAttachment,
  listCustomerProjectMessages,
  markCustomerProjectMessagesRead,
} from '../../api/customProjectsApi'
import {
  ProjectMessagesPanel,
  type ProjectMessagesPanelAdapters,
} from '../../components/projects/ProjectMessagesPanel'
import { resolveCustomerMessageSenderLabel } from '../../lib/projectMessages'
import { useAuthStore } from '../../store/authStore'

interface CustomerProjectMessagesSectionProps {
  projectId: string
}

export function CustomerProjectMessagesSection({
  projectId,
}: CustomerProjectMessagesSectionProps) {
  const currentUserId = useAuthStore((state) => state.user?.id)

  const adapters = useMemo<ProjectMessagesPanelAdapters>(
    () => ({
      listMessages: listCustomerProjectMessages,
      createMessage: createCustomerProjectMessage,
      downloadAttachment: downloadCustomerProjectMessageAttachment,
      markRead: markCustomerProjectMessagesRead,
      messagesQueryKey: ['customer', 'custom-projects', projectId, 'messages'],
      invalidateAfterMarkRead: (queryKey: QueryKey) => {
        const [scope, resource, third] = queryKey
        return (
          scope === 'customer' &&
          resource === 'custom-projects' &&
          typeof third === 'object' &&
          third !== null
        )
      },
      resolveSenderLabel: (message) =>
        resolveCustomerMessageSenderLabel(message, currentUserId),
    }),
    [currentUserId, projectId],
  )

  return (
    <ProjectMessagesPanel
      projectId={projectId}
      adapters={adapters}
      titleId="project-messages-title"
      composerLabel="Write a message"
      composerPlaceholder="Ask a question or share project details…"
      submitLabel="Send message"
      bodyFieldId="project-message-body"
      attachmentFieldId="project-message-attachment"
      sendErrorFallback="Could not send your message. Please try again."
    />
  )
}
