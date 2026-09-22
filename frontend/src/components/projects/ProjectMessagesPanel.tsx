import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import type { QueryKey } from '@tanstack/react-query'

import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { ErrorState } from '../ui/ErrorState'
import { FormField } from '../ui/FormField'
import { Spinner } from '../ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { formatDateTime, formatFileSize } from '../../lib/format'
import {
  PROJECT_MESSAGE_ATTACHMENT_ACCEPT,
  PROJECT_MESSAGE_ATTACHMENT_FORMAT_LABELS,
  PROJECT_MESSAGE_ATTACHMENT_MAX_MB,
  validateProjectMessageAttachment,
} from '../../lib/projectMessageUpload'
import {
  fetchLatestProjectMessages,
  PROJECT_MESSAGE_PAGE_SIZE,
  type ProjectMessageListFn,
} from '../../lib/projectMessages'
import type {
  ProjectMessage,
  ProjectMessageAttachment,
  ProjectMessageCreatePayload,
} from '../../types/customProject'

export const PROJECT_MESSAGE_MAX_LENGTH = 5000

export interface ProjectMessagesPanelAdapters {
  listMessages: ProjectMessageListFn
  createMessage: (
    projectId: string,
    payload: ProjectMessageCreatePayload,
  ) => Promise<ProjectMessage>
  downloadAttachment: (
    projectId: string,
    messageId: string,
    attachmentId: string,
    fileName: string,
  ) => Promise<void>
  markRead: (projectId: string) => Promise<unknown>
  messagesQueryKey: QueryKey
  /** Invalidate list badges / sibling project queries after mark-read. */
  invalidateAfterMarkRead: (queryKey: QueryKey) => boolean
  resolveSenderLabel: (message: ProjectMessage) => string
}

export interface ProjectMessagesPanelProps {
  projectId: string
  adapters: ProjectMessagesPanelAdapters
  sectionClassName?: string
  titleId: string
  hint?: ReactNode
  composerLabel: string
  composerPlaceholder: string
  submitLabel: string
  bodyFieldId: string
  attachmentFieldId: string
  sendErrorFallback: string
}

export function ProjectMessagesPanel({
  projectId,
  adapters,
  sectionClassName = 'admin-media-section',
  titleId,
  hint,
  composerLabel,
  composerPlaceholder,
  submitLabel,
  bodyFieldId,
  attachmentFieldId,
  sendErrorFallback,
}: ProjectMessagesPanelProps) {
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const markedReadForLoadKey = useRef<string | null>(null)

  const messagesQuery = useQuery({
    queryKey: adapters.messagesQueryKey,
    queryFn: () =>
      fetchLatestProjectMessages(
        adapters.listMessages,
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

    const { markRead, invalidateAfterMarkRead } = adapters
    void markRead(projectId)
      .then(() =>
        queryClient.invalidateQueries({
          predicate: (query) => invalidateAfterMarkRead(query.queryKey),
        }),
      )
      .catch(() => {
        markedReadForLoadKey.current = null
      })
    // adapters intentionally omitted — wrappers memoize stable API callbacks
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mark-read once per successful load
  }, [
    messagesQuery.isSuccess,
    messagesQuery.dataUpdatedAt,
    projectId,
    queryClient,
  ])

  const sendMutation = useMutation({
    mutationFn: (payload: ProjectMessageCreatePayload) =>
      adapters.createMessage(projectId, payload),
    onSuccess: async () => {
      setBody('')
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setSendError(null)
      await queryClient.invalidateQueries({ queryKey: adapters.messagesQueryKey })
    },
    onError: (error) => {
      setSendError(getApiErrorMessage(error, sendErrorFallback))
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
    if (trimmed.length > PROJECT_MESSAGE_MAX_LENGTH) {
      setSendError(`Message cannot exceed ${PROJECT_MESSAGE_MAX_LENGTH} characters.`)
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
      await adapters.downloadAttachment(
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
    <section className={sectionClassName} aria-labelledby={titleId}>
      <h2 id={titleId}>Messages</h2>
      {hint}

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
                    {adapters.resolveSenderLabel(message)}
                  </span>
                  <time dateTime={message.created_at}>
                    {formatDateTime(message.created_at)}
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
        <FormField id={bodyFieldId} label={composerLabel}>
          <textarea
            id={bodyFieldId}
            className="ui-input project-message-composer__input"
            rows={4}
            maxLength={PROJECT_MESSAGE_MAX_LENGTH}
            value={body}
            disabled={isSending}
            onChange={(event) => setBody(event.target.value)}
            placeholder={composerPlaceholder}
          />
        </FormField>
        <FormField id={attachmentFieldId} label="Attachment (optional)">
          <input
            ref={fileInputRef}
            id={attachmentFieldId}
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
          {submitLabel}
        </Button>
      </form>
    </section>
  )
}
