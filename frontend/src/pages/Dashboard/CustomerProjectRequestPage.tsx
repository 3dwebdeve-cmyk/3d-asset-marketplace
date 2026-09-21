import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import {
  createCustomerCustomProject,
  createCustomerProjectMessage,
  uploadCustomerCustomProjectFile,
} from '../../api/customProjectsApi'
import { Alert } from '../../components/ui/Alert'
import { getApiErrorMessage } from '../../lib/apiError'
import {
  PROJECT_FILE_ACCEPT,
  PROJECT_FILE_MAX_MB,
  validateProjectFile,
} from '../../lib/projectFileUpload'
import {
  PROJECT_MESSAGE_ATTACHMENT_ACCEPT,
  validateProjectMessageAttachment,
} from '../../lib/projectMessageUpload'
import { toast } from '../../lib/toast'
import type {
  CustomerCustomProjectCreatePayload,
  ProjectFileType,
} from '../../types/customProject'

const emptyForm: CustomerCustomProjectCreatePayload = {
  title: '',
  description: '',
  category: '',
  estimated_budget: '',
  currency: 'USD',
  deadline: '',
}

const FILE_TYPE_OPTIONS: { value: ProjectFileType; label: string }[] = [
  { value: 'reference_image', label: 'Reference image' },
  { value: 'cad_drawing', label: 'CAD drawing' },
  { value: 'sketch', label: 'Sketch' },
  { value: 'other', label: 'Other' },
]

function validateForm(form: CustomerCustomProjectCreatePayload): string | null {
  if (form.title.trim().length < 3) {
    return 'Title must be at least 3 characters.'
  }
  if (form.description.trim().length < 10) {
    return 'Description must be at least 10 characters.'
  }
  if (form.estimated_budget) {
    const budget = Number(form.estimated_budget)
    if (!Number.isFinite(budget) || budget < 0) {
      return 'Enter a valid non-negative budget.'
    }
  }
  return null
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4h11l3 3v13H5V4Z" />
      <path d="M8 4v5h8V4" />
      <path d="M8 20v-7h8v7" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 16.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5" />
      <path d="M12 4v11" />
      <path d="m8 8 4-4 4 4" />
    </svg>
  )
}

export function CustomerProjectRequestPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const referenceInputId = useId()
  const messageFileInputId = useId()
  const referenceInputRef = useRef<HTMLInputElement>(null)
  const messageFileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<CustomerCustomProjectCreatePayload>(emptyForm)
  const [validationError, setValidationError] = useState<string | null>(null)

  const [referenceFileType, setReferenceFileType] =
    useState<ProjectFileType>('reference_image')
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [referenceError, setReferenceError] = useState<string | null>(null)

  const [messageBody, setMessageBody] = useState('')
  const [messageFile, setMessageFile] = useState<File | null>(null)
  const [messageError, setMessageError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: async () => {
      const project = await createCustomerCustomProject({
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category?.trim() || '',
        currency: form.currency?.trim() || 'USD',
        estimated_budget: form.estimated_budget
          ? Number(form.estimated_budget).toFixed(2)
          : null,
        deadline: form.deadline || null,
      })

      if (referenceFile) {
        await uploadCustomerCustomProjectFile(project.id, {
          file: referenceFile,
          file_type: referenceFileType,
        })
      }

      const trimmedMessage = messageBody.trim()
      if (trimmedMessage || messageFile) {
        await createCustomerProjectMessage(project.id, {
          body: trimmedMessage || 'Reference note',
          file: messageFile ?? undefined,
        })
      }

      return project
    },
    onSuccess: async (project) => {
      toast.success('Project request submitted')
      await queryClient.invalidateQueries({
        queryKey: ['customer', 'custom-projects'],
        refetchType: 'none',
      })
      navigate(`/dashboard/projects/${project.id}`, { replace: true })
    },
  })

  const onReferenceFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setReferenceError(null)
    if (!file) {
      setReferenceFile(null)
      return
    }
    const error = validateProjectFile(file)
    if (error) {
      setReferenceError(error)
      setReferenceFile(null)
      event.target.value = ''
      return
    }
    setReferenceFile(file)
  }

  const onMessageFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setMessageError(null)
    if (!file) {
      setMessageFile(null)
      return
    }
    const error = validateProjectMessageAttachment(file)
    if (error) {
      setMessageError(error)
      setMessageFile(null)
      event.target.value = ''
      return
    }
    setMessageFile(file)
  }

  const onSendMessageClick = () => {
    if (!messageBody.trim() && !messageFile) {
      setMessageError('Write a message or choose an attachment first.')
      return
    }
    setMessageError(null)
    toast.info('Your message will be sent when you save the project request.')
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const error = validateForm(form)
    setValidationError(error)
    if (error) return
    if (referenceError || messageError) return
    createMutation.mutate()
  }

  const serverError = createMutation.isError
    ? getApiErrorMessage(createMutation.error, 'Could not submit your project request.')
    : null

  return (
    <main className="dash-project-form" aria-labelledby="new-project-title">
      <div className="dash-project-form__top">
        <p className="dash-project-form__eyebrow">Customer Dashboard</p>
        <Link className="dash-project-form__back" to="/dashboard/projects">
          ← Back to My projects
        </Link>
      </div>

      <h1 id="new-project-title" className="dash-project-form__title">
        Request New Project
      </h1>
      <hr className="dash-project-form__divider" />

      <form onSubmit={onSubmit} noValidate>
        {validationError || serverError ? (
          <div className="dash-project-form__alerts">
            {validationError ? <Alert variant="error" message={validationError} /> : null}
            {serverError ? <Alert variant="error" message={serverError} /> : null}
          </div>
        ) : null}

        <section className="dash-project-form__section" aria-labelledby="project-details-heading">
          <h2 id="project-details-heading" className="dash-project-form__section-title">
            Project details
          </h2>
          <div className="dash-project-form__rows">
            <div className="dash-project-form__row">
              <label className="dash-project-form__label" htmlFor="request-title">
                Project title
              </label>
              <div className="dash-project-form__control">
                <input
                  id="request-title"
                  className="dash-project-form__input"
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="e.g. Game-ready wooden chair"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="dash-project-form__row">
              <label className="dash-project-form__label" htmlFor="request-category">
                Category
              </label>
              <div className="dash-project-form__control">
                <input
                  id="request-category"
                  className="dash-project-form__input"
                  value={form.category ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, category: event.target.value }))
                  }
                  placeholder="e.g. 3D Modeling, Furniture, Characters"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="dash-project-form__row">
              <span className="dash-project-form__label" id="budget-deadline-label">
                Budget &amp; Deadline
              </span>
              <div
                className="dash-project-form__control dash-project-form__split"
                role="group"
                aria-labelledby="budget-deadline-label"
              >
                <div className="dash-project-form__budget">
                  <label className="visually-hidden" htmlFor="request-currency">
                    Currency
                  </label>
                  <input
                    id="request-currency"
                    className="dash-project-form__input"
                    value={form.currency ?? 'USD'}
                    maxLength={3}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        currency: event.target.value.toUpperCase(),
                      }))
                    }
                    aria-label="Currency"
                  />
                  <label className="visually-hidden" htmlFor="request-budget">
                    Estimated budget
                  </label>
                  <input
                    id="request-budget"
                    className="dash-project-form__input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.estimated_budget ?? ''}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        estimated_budget: event.target.value,
                      }))
                    }
                    placeholder="0.00"
                    aria-label="Estimated budget"
                  />
                </div>
                <div>
                  <label className="visually-hidden" htmlFor="request-deadline">
                    Deadline
                  </label>
                  <input
                    id="request-deadline"
                    className="dash-project-form__input"
                    type="date"
                    value={form.deadline ?? ''}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, deadline: event.target.value }))
                    }
                    aria-label="Deadline"
                  />
                </div>
              </div>
            </div>

            <div className="dash-project-form__row">
              <label className="dash-project-form__label" htmlFor="request-description">
                Description
              </label>
              <div className="dash-project-form__control">
                <textarea
                  id="request-description"
                  className="dash-project-form__textarea"
                  rows={5}
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="Describe the model, style, formats, and any reference details…"
                />
                <p className="dash-project-form__hint">
                  Provide detailed specifications, poly-count goals, intended engine, and styling
                  requirements.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          className="dash-project-form__section"
          aria-labelledby="quotation-heading"
        >
          <h2 id="quotation-heading" className="dash-project-form__section-title">
            Quotation &amp; Preferences
          </h2>
          <div className="dash-project-form__rows">
            <div className="dash-project-form__row">
              <label className="dash-project-form__label" htmlFor="quote-amount">
                Quotation amount
              </label>
              <div className="dash-project-form__control">
                <input
                  id="quote-amount"
                  className="dash-project-form__input"
                  value=""
                  placeholder="Provided by our team after review"
                  disabled
                />
              </div>
            </div>
            <div className="dash-project-form__row">
              <label className="dash-project-form__label" htmlFor="quote-status">
                Status
              </label>
              <div className="dash-project-form__control">
                <select id="quote-status" className="dash-project-form__select" disabled value="">
                  <option value="">Awaiting quote</option>
                </select>
              </div>
            </div>
            <div className="dash-project-form__row">
              <label className="dash-project-form__label" htmlFor="quote-notes">
                Notes
              </label>
              <div className="dash-project-form__control">
                <input
                  id="quote-notes"
                  className="dash-project-form__input"
                  value=""
                  placeholder="Quotation notes will appear here"
                  disabled
                />
                <p className="dash-project-form__hint">
                  Our team will review your request and send a quotation you can accept and pay.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          className="dash-project-form__section"
          aria-labelledby="reference-files-heading"
        >
          <h2 id="reference-files-heading" className="dash-project-form__section-title">
            Reference files
          </h2>
          <div className="dash-project-form__rows">
            <div className="dash-project-form__row">
              <label className="dash-project-form__label" htmlFor="request-file-type">
                File type
              </label>
              <div className="dash-project-form__control">
                <select
                  id="request-file-type"
                  className="dash-project-form__select"
                  value={referenceFileType}
                  onChange={(event) =>
                    setReferenceFileType(event.target.value as ProjectFileType)
                  }
                >
                  {FILE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="dash-project-form__row">
              <span className="dash-project-form__label" id="upload-reference-label">
                Upload reference
              </span>
              <div className="dash-project-form__control" aria-labelledby="upload-reference-label">
                <div className="dash-project-form__upload">
                  <span className="dash-project-form__upload-icon">
                    <UploadIcon />
                  </span>
                  <p className="dash-project-form__upload-text">
                    Upload sketches, photos, or CAD references (JPG, PNG, WebP, PDF, ZIP; max{' '}
                    {PROJECT_FILE_MAX_MB} MB).
                  </p>
                  <div className="dash-project-form__file-row">
                    <button
                      type="button"
                      className="dash-project-form__file-btn"
                      onClick={() => referenceInputRef.current?.click()}
                    >
                      Choose file
                    </button>
                    <span className="dash-project-form__file-name">
                      {referenceFile ? referenceFile.name : 'No file chosen'}
                    </span>
                  </div>
                  <input
                    id={referenceInputId}
                    ref={referenceInputRef}
                    className="visually-hidden"
                    type="file"
                    accept={PROJECT_FILE_ACCEPT}
                    onChange={onReferenceFileChange}
                  />
                </div>
                {referenceError ? (
                  <p className="dash-project-form__hint" role="alert">
                    {referenceError}
                  </p>
                ) : (
                  <p className="dash-project-form__hint">
                    Optional. The selected file is uploaded when you save the project request.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section
          className="dash-project-form__section"
          aria-labelledby="deliverables-heading"
        >
          <h2 id="deliverables-heading" className="dash-project-form__section-title">
            Deliverables
          </h2>
          <p className="dash-project-form__empty">
            No deliverables yet. Your designer will upload final files here when ready.
          </p>
        </section>

        <section className="dash-project-form__section" aria-labelledby="messages-heading">
          <h2 id="messages-heading" className="dash-project-form__section-title">
            Messages
          </h2>
          <p className="dash-project-form__empty">No messages yet.</p>

          <div className="dash-project-form__composer">
            <p className="dash-project-form__composer-title" id="write-message-label">
              Write a message
            </p>
            <textarea
              id="request-message"
              className="dash-project-form__textarea"
              rows={4}
              value={messageBody}
              onChange={(event) => setMessageBody(event.target.value)}
              placeholder="Ask a question or share project details..."
              aria-labelledby="write-message-label"
            />

            <p className="dash-project-form__composer-title" id="message-attachment-label">
              Attachment (optional)
            </p>
            <div className="dash-project-form__file-row" style={{ justifyContent: 'flex-start' }}>
              <button
                type="button"
                className="dash-project-form__file-btn"
                onClick={() => messageFileInputRef.current?.click()}
              >
                Choose file
              </button>
              <span className="dash-project-form__file-name">
                {messageFile ? messageFile.name : 'No file chosen'}
              </span>
              <input
                id={messageFileInputId}
                ref={messageFileInputRef}
                className="visually-hidden"
                type="file"
                accept={PROJECT_MESSAGE_ATTACHMENT_ACCEPT}
                onChange={onMessageFileChange}
                aria-labelledby="message-attachment-label"
              />
            </div>
            <p className="dash-project-form__hint">
              Allowed: JPG, PNG, WebP, PDF, ZIP. Max {PROJECT_FILE_MAX_MB} MB.
            </p>
            {messageError ? (
              <p className="dash-project-form__hint" role="alert">
                {messageError}
              </p>
            ) : null}

            <button type="button" className="dash-project-form__send" onClick={onSendMessageClick}>
              Send message
            </button>
          </div>
        </section>

        <div className="dash-project-form__footer">
          <button
            type="submit"
            className="dash-project-form__submit"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              'Please wait…'
            ) : (
              <>
                <SaveIcon />
                Save &amp; Request Project
              </>
            )}
          </button>
          <Link className="dash-project-form__cancel" to="/dashboard/projects">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  )
}
