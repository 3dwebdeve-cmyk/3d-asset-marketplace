import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'

import {
  approveAdminPlugin,
  rejectAdminPlugin,
  requeueAdminPlugin,
} from '../../api/pluginsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import type { AdminPlugin } from '../../types/plugin'

const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/

interface PluginReviewPanelProps {
  plugin: AdminPlugin
}

// Shown only while a plugin is waiting for review or was rejected. The reviewer sets the
// price here (0 means free); the server records who decided and when.
export function PluginReviewPanel({ plugin }: PluginReviewPanelProps) {
  const queryClient = useQueryClient()
  const [price, setPrice] = useState('')
  const [discountPrice, setDiscountPrice] = useState('')
  const [qaNotes, setQaNotes] = useState(plugin.qa_notes ?? '')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'plugins'] })

  const approveMutation = useMutation({
    mutationFn: () =>
      approveAdminPlugin(plugin.id, {
        price,
        discount_price: discountPrice === '' ? null : discountPrice,
        qa_notes: qaNotes,
      }),
    onSuccess: async () => {
      toast.success('Plugin approved and published')
      await refresh()
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not approve plugin.')),
  })

  const rejectMutation = useMutation({
    mutationFn: () => rejectAdminPlugin(plugin.id, { reason, qa_notes: qaNotes }),
    onSuccess: async () => {
      toast.success('Plugin rejected')
      await refresh()
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not reject plugin.')),
  })

  const requeueMutation = useMutation({
    mutationFn: () => requeueAdminPlugin(plugin.id),
    onSuccess: async () => {
      toast.success('Plugin sent back to the review queue')
      await refresh()
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not requeue plugin.')),
  })

  const busy = approveMutation.isPending || rejectMutation.isPending || requeueMutation.isPending

  const onApprove = (event: FormEvent) => {
    event.preventDefault()
    if (!PRICE_PATTERN.test(price.trim())) {
      setError('Enter a price such as 0, 9 or 24.50 (use 0 for a free plugin).')
      return
    }
    if (discountPrice !== '' && !PRICE_PATTERN.test(discountPrice.trim())) {
      setError('The discount price must be a number such as 19.99, or left empty.')
      return
    }
    setError(null)
    approveMutation.mutate()
  }

  const onReject = (event: FormEvent) => {
    event.preventDefault()
    if (!reason.trim()) {
      setError('Enter the reason so the uploader knows what to fix.')
      return
    }
    setError(null)
    rejectMutation.mutate()
  }

  if (plugin.status === 'rejected') {
    return (
      <section className="dashboard-card" aria-labelledby="plugin-review-title">
        <h2 id="plugin-review-title">Rejected</h2>
        <p>
          <strong>Reason:</strong> {plugin.reject_reason || 'No reason given.'}
        </p>
        {error ? <Alert variant="error" message={error} /> : null}
        <Button
          type="button"
          variant="secondary"
          isLoading={requeueMutation.isPending}
          disabled={busy}
          onClick={() => requeueMutation.mutate()}
        >
          Send back to review
        </Button>
      </section>
    )
  }

  if (plugin.status !== 'pending_review') {
    return null
  }

  return (
    <section className="dashboard-card dashboard-card--wide" aria-labelledby="plugin-review-title">
      <h2 id="plugin-review-title">Review</h2>
      {error ? <Alert variant="error" message={error} /> : null}

      <form className="admin-create-form" onSubmit={onApprove} noValidate>
        <FormField id="review-price" label="Price (0 = free)">
          <Input
            id="review-price"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </FormField>
        <FormField id="review-discount" label="Discount price (optional)">
          <Input
            id="review-discount"
            inputMode="decimal"
            value={discountPrice}
            onChange={(event) => setDiscountPrice(event.target.value)}
          />
        </FormField>
        <FormField id="review-notes" label="QA notes (internal)">
          <textarea
            id="review-notes"
            className="ui-input"
            rows={3}
            value={qaNotes}
            onChange={(event) => setQaNotes(event.target.value)}
          />
        </FormField>
        <Button type="submit" isLoading={approveMutation.isPending} disabled={busy}>
          Approve and publish
        </Button>
      </form>

      <form className="admin-create-form" onSubmit={onReject} noValidate>
        <FormField id="review-reason" label="Reject reason (shown to the uploader)">
          <textarea
            id="review-reason"
            className="ui-input"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </FormField>
        <Button type="submit" variant="secondary" isLoading={rejectMutation.isPending} disabled={busy}>
          Reject
        </Button>
      </form>
    </section>
  )
}
