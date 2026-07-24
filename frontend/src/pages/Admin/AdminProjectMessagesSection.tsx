import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'

import {
  createAdminProjectMessage,
  downloadAdminProjectMessageAttachment,
  listAdminProjectMessages,
  markAdminProjectMessagesRead,
} from '../../api/customProjectsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { formatFileSize } from '../../lib/productUpload'
import {
  PROJECT_MESSAGE_ATTACHMENT_ACCEPT,
  PROJECT_MESSAGE_ATTACHMENT_FORMAT_LABELS,
  PROJECT_MESSAGE_ATTACHMENT_MAX_MB,
  validateProjectMessageAttachment,
} from '../../lib/projectMessageUpload'
import {
  fetchLatestProjectMessages,
  PROJECT_MESSAGE_PAGE_SIZE,
  resolveAdminMessageSenderLabel,
} from '../../lib/projectMessages'
import { useAuthStore } from '../../store/authStore'
import type { ProjectMessageAttachment } from '../../types/customProject'

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

interface AdminProjectMessagesSectionProps {
  projectId: string
  customerId: string
}

export function AdminProjectMessagesSection({
  projectId,
  customerId,
}: AdminProjectMessagesSectionProps) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((state) => state.user?.id)
  const [body, setBody] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const markedReadForLoadKey = useRef<string | null>(null)

  const messagesQuery = useQuery({
    queryKey: ['admin', 'custom-projects', projectId, 'messages'],
    queryFn: () =>
      fetchLatestProjectMessages(
        listAdminProjectMessages,
        projectId,
        PROJECT_MESSAGE_PAGE_SIZE,
      ),
    enabled: Boolean(projectId),
    retry: false,
  })

  useEffect(() => {
    if (!messagesQuery.isSuccess || !projectId) return
    const loadKey = `${projectId}:${messagesQuery.dataUpdatedAt}`
    if (markedReadForLoadKey.current === loadKey) return
    markedReadForLoadKey.current = loadKey

    void markAdminProjectMessagesRead(projectId)
      .then(() =>
        queryClient.invalidateQueries({
          predicate: (query) => {
            const [scope, resource, third] = query.queryKey
            return (
              scope === 'admin' &&
              resource === 'custom-projects' &&
              typeof third === 'object' &&
              third !== null
            )
          },
        }),
      )
      .catch(() => {
        markedReadForLoadKey.current = null
      })
  }, [
    messagesQuery.isSuccess,
    messagesQuery.dataUpdatedAt,
    projectId,
    queryClient,
  ])

  const sendMutation = useMutation({
    mutationFn: (payload: { body: string; file?: File }) =>
      createAdminProjectMessage(projectId, payload),
    onSuccess: async () => {
      setBody('')
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setSendError(null)
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'custom-projects', projectId, 'messages'],
      })
    },
    onError: (error) => {
      setSendError(getApiErrorMessage(error, 'Could not send your reply. Please try again.'))
    },
  })

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      setSelectedFile(null)
      return
    }
    const validationError = validateProjectMessageAttachment(file)
    if (validationError) {
      setSendError(validationError)
      setSelectedFile(null)
      event.target.value = ''
      return
    }
    setSendError(null)
    setSelectedFile(file)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = body.trim()
    if (!trimmed && !selectedFile) {
      setSendError('Provide a message or an attachment.')
      return
    }
    if (trimmed.length > MESSAGE_MAX_LENGTH) {
      setSendError(`Message cannot exceed ${MESSAGE_MAX_LENGTH} characters.`)
      return
    }
    setSendError(null)
    sendMutation.mutate(
      selectedFile ? { body: trimmed, file: selectedFile } : { body: trimmed },
    )
  }

  const onDownloadAttachment = async (
    messageId: string,
    attachment: ProjectMessageAttachment,
  ) => {
    setDownloadError(null)
    try {
      await downloadAdminProjectMessageAttachment(
        projectId,
        messageId,
        attachment.id,
        attachment.file_name,
      )
    } catch (error) {
      setDownloadError(
        getApiErrorMessage(error, 'Could not download the attachment. Please try again.'),
      )
    }
  }

  const messages = messagesQuery.data?.messages ?? []
  const truncated = messagesQuery.data?.truncated ?? false
  const isSending = sendMutation.isPending
  const canSend = Boolean(body.trim() || selectedFile)

  return (
    <section
      className="admin-media-section admin-project-messages"
      aria-labelledby="admin-project-messages-title"
    >
      <h2 id="admin-project-messages-title">Messages</h2>
      <p className="admin-project-messages__hint">
        Shared with the customer. Separate from internal Admin notes above.
      </p>

      {downloadError ? <Alert variant="error" message={downloadError} /> : null}

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
        <>
          {truncated ? (
            <p className="home-page__subtitle" role="status">
              Showing the latest {PROJECT_MESSAGE_PAGE_SIZE} messages.
            </p>
          ) : null}
          <ul className="project-message-thread" aria-label="Project message thread">
            {messages.map((message) => (
              <li key={message.id} className="project-message-item">
                <div className="project-message-item__meta">
                  <span className="project-message-item__sender">
                    {resolveAdminMessageSenderLabel(message, currentUserId, customerId)}
                  </span>
                  <time dateTime={message.created_at}>
                    {formatMessageTimestamp(message.created_at)}
                  </time>
                </div>
                {message.body ? (
                  <p className="project-message-item__body">{message.body}</p>
                ) : null}
                {(message.attachments ?? []).length > 0 ? (
                  <ul className="project-message-attachments" aria-label="Attachments">
                    {(message.attachments ?? []).map((attachment) => (
                      <li key={attachment.id} className="project-message-attachment">
                        <span className="project-message-attachment__meta">
                          {attachment.file_name} · {formatFileSize(attachment.file_size)}
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void onDownloadAttachment(message.id, attachment)}
                        >
                          Download
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}

      <form className="project-message-composer" onSubmit={onSubmit} noValidate>
        {sendError ? <Alert variant="error" message={sendError} /> : null}
        <FormField id="admin-project-message-body" label="Reply to customer">
          <textarea
            id="admin-project-message-body"
            className="ui-input project-message-composer__input"
            rows={4}
            maxLength={MESSAGE_MAX_LENGTH}
            value={body}
            disabled={isSending}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Send a reply the customer can see…"
          />
        </FormField>
        <FormField id="admin-project-message-attachment" label="Attachment (optional)">
          <input
            ref={fileInputRef}
            id="admin-project-message-attachment"
            type="file"
            accept={PROJECT_MESSAGE_ATTACHMENT_ACCEPT}
            disabled={isSending}
            onChange={onFileChange}
          />
        </FormField>
        <p className="project-message-composer__hint">
          Allowed: {PROJECT_MESSAGE_ATTACHMENT_FORMAT_LABELS.join(', ')}. Max{' '}
          {PROJECT_MESSAGE_ATTACHMENT_MAX_MB} MB.
        </p>
        {selectedFile ? (
          <p className="project-message-composer__file" role="status">
            Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
            <button
              type="button"
              className="project-message-composer__clear-file"
              disabled={isSending}
              onClick={() => {
                setSelectedFile(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
            >
              Remove
            </button>
          </p>
        ) : null}
        <Button type="submit" isLoading={isSending} disabled={!canSend}>
          Send reply
        </Button>
      </form>
    </section>
  )
}
