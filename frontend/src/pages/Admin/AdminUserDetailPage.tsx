import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  deactivateAdminUser,
  getAdminUser,
  updateAdminUser,
} from '../../api/authApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import type { AdminUserUpdatePayload } from '../../types/auth'

export function AdminUserDetailPage() {
  const { userId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<AdminUserUpdatePayload>({})
  const [formError, setFormError] = useState<string | null>(null)

  const userQuery = useQuery({
    queryKey: ['admin', 'users', userId],
    queryFn: () => getAdminUser(userId),
    enabled: Boolean(userId),
  })

  useEffect(() => {
    if (!userQuery.data) {
      return
    }
    setForm({
      full_name: userQuery.data.full_name,
      phone: userQuery.data.phone,
      country: userQuery.data.country,
      role: userQuery.data.role as AdminUserUpdatePayload['role'],
      is_active: userQuery.data.is_active,
    })
  }, [userQuery.data])

  const saveMutation = useMutation({
    mutationFn: (payload: AdminUserUpdatePayload) => updateAdminUser(userId, payload),
    onSuccess: async () => {
      toast.success('User updated')
      setFormError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      navigate('/admin', { replace: true })
    },
    onError: (error) => {
      setFormError(getApiErrorMessage(error, 'Could not update user.'))
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateAdminUser(userId),
    onSuccess: async () => {
      toast.success('User deactivated')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      navigate('/admin', { replace: true })
    },
    onError: (error) => {
      setFormError(getApiErrorMessage(error, 'Could not deactivate user.'))
    },
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    saveMutation.mutate(form)
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-card" aria-labelledby="admin-user-detail-title">
        <p className="home-page__eyebrow">Administrator</p>
        <h1 id="admin-user-detail-title">Manage user</h1>

        <div className="dashboard-card__actions">
          <Link className="home-page__cta home-page__cta--secondary" to="/admin/users">
            Back to users
          </Link>
        </div>

        {userQuery.isLoading ? (
          <Spinner label="Loading user..." />
        ) : userQuery.isError ? (
          <ErrorState
            title="User not found"
            description="This account could not be loaded."
            action={
              <Button variant="secondary" onClick={() => userQuery.refetch()}>
                Retry
              </Button>
            }
          />
        ) : (
          <form className="admin-create-form" onSubmit={onSubmit} noValidate>
            {formError ? <Alert variant="error" message={formError} /> : null}
            <FormField id="detail-full-name" label="Full name">
              <Input
                id="detail-full-name"
                value={form.full_name ?? ''}
                onChange={(event) =>
                  setForm((current) => ({ ...current, full_name: event.target.value }))
                }
              />
            </FormField>
            <FormField id="detail-email" label="Email">
              <Input id="detail-email" value={userQuery.data?.email ?? ''} disabled />
            </FormField>
            <FormField id="detail-phone" label="Phone">
              <Input
                id="detail-phone"
                value={form.phone ?? ''}
                onChange={(event) =>
                  setForm((current) => ({ ...current, phone: event.target.value }))
                }
              />
            </FormField>
            <FormField id="detail-country" label="Country">
              <Input
                id="detail-country"
                value={form.country ?? ''}
                onChange={(event) =>
                  setForm((current) => ({ ...current, country: event.target.value }))
                }
              />
            </FormField>
            <FormField id="detail-role" label="Role">
              <select
                id="detail-role"
                className="ui-input"
                value={form.role ?? 'Customer'}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    role: event.target.value as AdminUserUpdatePayload['role'],
                  }))
                }
              >
                <option value="Customer">Customer</option>
                <option value="Administrator">Administrator</option>
              </select>
            </FormField>
            <FormField id="detail-active" label="Status">
              <select
                id="detail-active"
                className="ui-input"
                value={form.is_active ? 'active' : 'inactive'}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    is_active: event.target.value === 'active',
                  }))
                }
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </FormField>
            <div className="dashboard-card__actions">
              <Button type="submit" isLoading={saveMutation.isPending}>
                Save changes
              </Button>
              <Button
                type="button"
                variant="secondary"
                isLoading={deactivateMutation.isPending}
                onClick={() => deactivateMutation.mutate()}
              >
                Deactivate
              </Button>
            </div>
          </form>
        )}
      </section>
    </main>
  )
}
