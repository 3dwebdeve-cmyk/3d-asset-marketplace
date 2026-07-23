import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'

import {
  createCustomerProjectMessage,
  listCustomerProjectMessages,
} from '../../api/customProjectsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { useAuthStore } from '../../store/authStore'
import type { ProjectMessage } from '../../types/customProject'

const MESSAGE_PAGE_SIZE = 100
const MESSAGE_MAX_LENGTH = 5000

function formatMessageTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function senderLabel(message: ProjectMessage, currentUserId: string | undefined): string {
  if (currentUserId && message.sender.id === currentUserId) {
    return 'You'
  }
  return 'Studio'
}

interface CustomerProjectMessagesSectionProps {
  projectId: string
}

export function CustomerProjectMessagesSection({
  projectId,
}: CustomerProjectMessagesSectionProps) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((state) => state.user?.id)
  const [body, setBody] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)

  const messagesQuery = useQuery({
    queryKey: ['customer', 'custom-projects', projectId, 'messages'],
    queryFn: () =>
      listCustomerProjectMessages(projectId, {
        page: 1,
        page_size: MESSAGE_PAGE_SIZE,
      }),
    enabled: Boolean(projectId),
    retry: false,
  })

  const sendMutation = useMutation({
    mutationFn: (messageBody: string) =>
      createCustomerProjectMessage(projectId, { body: messageBody }),
    onSuccess: async () => {
      setBody('')
      setSendError(null)
      await queryClient.invalidateQueries({
        queryKey: ['customer', 'custom-projects', projectId, 'messages'],
      })
    },
    onError: (error) => {
      setSendError(getApiErrorMessage(error, 'Could not send your message. Please try again.'))
    },
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = body.trim()
    if (!trimmed) {
      setSendError('Message cannot be empty.')
      return
    }
    if (trimmed.length > MESSAGE_MAX_LENGTH) {
      setSendError(`Message cannot exceed ${MESSAGE_MAX_LENGTH} characters.`)
      return
    }
    setSendError(null)
    sendMutation.mutate(trimmed)
  }

  const messages = messagesQuery.data?.results ?? []
  const isSending = sendMutation.isPending

  return (
    <section className="admin-media-section" aria-labelledby="project-messages-title">
      <h2 id="project-messages-title">Messages</h2>

      {messagesQuery.isLoading ? (
        <Spinner label="Loading messages..." />
      ) : messagesQuery.isError ? (
        <ErrorState
          title="Could not load messages"
          description={getApiErrorMessage(
            messagesQuery.error,
            'The message thread could not be loaded. Please try again.',
          )}
          action={
            <Button
              variant="secondary"
              isLoading={messagesQuery.isFetching}
              onClick={() => messagesQuery.refetch()}
            >
              Retry
            </Button>
          }
        />
      ) : messages.length === 0 ? (
        <p className="home-page__subtitle" role="status">
          No messages yet.
        </p>
      ) : (
        <ul className="project-message-thread" aria-label="Project message thread">
          {messages.map((message) => (
            <li key={message.id} className="project-message-item">
              <div className="project-message-item__meta">
                <span className="project-message-item__sender">
                  {senderLabel(message, currentUserId)}
                </span>
                <time dateTime={message.created_at}>
                  {formatMessageTimestamp(message.created_at)}
                </time>
              </div>
              <p className="project-message-item__body">{message.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form className="project-message-composer" onSubmit={onSubmit} noValidate>
        {sendError ? <Alert variant="error" message={sendError} /> : null}
        <FormField id="project-message-body" label="Write a message">
          <textarea
            id="project-message-body"
            className="ui-input project-message-composer__input"
            rows={4}
            maxLength={MESSAGE_MAX_LENGTH}
            value={body}
            disabled={isSending}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Ask a question or share project details…"
          />
        </FormField>
        <Button type="submit" isLoading={isSending} disabled={!body.trim()}>
          Send message
        </Button>
      </form>
    </section>
  )
}
