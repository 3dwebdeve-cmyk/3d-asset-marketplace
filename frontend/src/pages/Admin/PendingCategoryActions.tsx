import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  approveAdminCategory,
  listAdminCategories,
  mergeAdminCategory,
  rejectAdminCategory,
} from '../../api/categoriesApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'

interface PendingCategoryActionsProps {
  category: { id: string; name: string; rejected_at: string | null }
}

/** Approve, Merge into… or Reject a category an upload created. The same actions on the
 * Categories page and on the QA page of one of its models. */
export function PendingCategoryActions({ category }: PendingCategoryActionsProps) {
  const queryClient = useQueryClient()
  const [mergeTarget, setMergeTarget] = useState('')
  const [error, setError] = useState<string | null>(null)

  const targetsQuery = useQuery({
    queryKey: ['admin', 'categories', 'merge-targets'],
    queryFn: () => listAdminCategories({ is_active: true, pending_approval: false, page_size: 100 }),
  })

  const refresh = async (message: string) => {
    toast.success(message)
    setError(null)
    await queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
  }
  const onError = (fallback: string) => (failure: unknown) =>
    setError(getApiErrorMessage(failure, fallback))

  const approve = useMutation({
    mutationFn: () => approveAdminCategory(category.id),
    onSuccess: () => refresh(`Category "${category.name}" is live; its models can be approved.`),
    onError: onError('Could not approve the category.'),
  })
  const merge = useMutation({
    mutationFn: () => mergeAdminCategory(category.id, mergeTarget),
    onSuccess: (target) => refresh(`Models moved to "${target.name}".`),
    onError: onError('Could not merge the category.'),
  })
  const reject = useMutation({
    mutationFn: () => rejectAdminCategory(category.id),
    onSuccess: (kept) =>
      refresh(
        kept
          ? `Category "${category.name}" rejected; its models stay in QA until it is approved or merged.`
          : `Category "${category.name}" deleted.`,
      ),
    onError: onError('Could not reject the category.'),
  })

  const busy = approve.isPending || merge.isPending || reject.isPending
  const targets = (targetsQuery.data?.results ?? []).filter((target) => target.id !== category.id)

  return (
    <div className="pending-category-actions">
      {error ? <Alert variant="error" message={error} /> : null}
      <div className="dashboard-card__actions">
        <Button type="button" isLoading={approve.isPending} disabled={busy} onClick={() => approve.mutate()}>
          Approve category
        </Button>
        <select
          className="ui-input"
          aria-label={`Merge ${category.name} into`}
          value={mergeTarget}
          onChange={(event) => setMergeTarget(event.target.value)}
          disabled={busy}
        >
          <option value="">Merge into…</option>
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="secondary"
          isLoading={merge.isPending}
          disabled={busy || !mergeTarget}
          onClick={() => merge.mutate()}
        >
          Merge
        </Button>
        <Button
          type="button"
          variant="secondary"
          isLoading={reject.isPending}
          disabled={busy || category.rejected_at !== null}
          onClick={() =>
            window.confirm(`Reject the category "${category.name}"?`) && reject.mutate()
          }
        >
          Reject
        </Button>
      </div>
    </div>
  )
}
