import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { createAdminCoupon, listAdminCoupons } from '../../api/adminCouponsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import type {
  AdminCouponCreatePayload,
  CouponDiscountType,
} from '../../types/coupon'

const emptyCreateForm: AdminCouponCreatePayload = {
  code: '',
  discount_type: 'percent',
  discount_value: '',
  expiry_date: null,
  active: true,
  max_uses: null,
  max_uses_per_user: 1,
}

function formatDiscount(type: CouponDiscountType, value: string): string {
  return type === 'percent' ? `${value}%` : `$${value}`
}

export function AdminCouponsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] =
    useState<AdminCouponCreatePayload>(emptyCreateForm)
  const [createError, setCreateError] = useState<string | null>(null)

  const activeParam =
    activeFilter === 'active'
      ? true
      : activeFilter === 'inactive'
        ? false
        : undefined

  const couponsQuery = useQuery({
    queryKey: [
      'admin',
      'coupons',
      { search, active: activeFilter, discount_type: typeFilter },
    ],
    queryFn: () =>
      listAdminCoupons({
        search: search || undefined,
        active: activeParam,
        discount_type:
          typeFilter === 'percent' || typeFilter === 'fixed'
            ? typeFilter
            : undefined,
        page_size: 50,
      }),
  })

  const createMutation = useMutation({
    mutationFn: createAdminCoupon,
    onSuccess: async () => {
      toast.success('Coupon created')
      setCreateForm(emptyCreateForm)
      setShowCreate(false)
      setCreateError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] })
    },
    onError: (error) => {
      setCreateError(getApiErrorMessage(error, 'Could not create coupon.'))
    },
  })

  const onCreateSubmit = (event: FormEvent) => {
    event.preventDefault()
    setCreateError(null)
    createMutation.mutate({
      ...createForm,
      code: createForm.code.trim().toUpperCase(),
      expiry_date: createForm.expiry_date || null,
      max_uses: createForm.max_uses || null,
      max_uses_per_user: createForm.max_uses_per_user || null,
    })
  }

  return (
    <main className="dashboard-page">
      <section
        className="dashboard-card dashboard-card--wide"
        aria-labelledby="admin-coupons-title"
      >
        <p className="home-page__eyebrow">Administrator</p>
        <h1 id="admin-coupons-title">Coupons</h1>
        <p className="home-page__subtitle">
          Create discount codes customers can apply on the cart.
        </p>

        <div className="dashboard-card__actions">
          <Button type="button" onClick={() => setShowCreate((value) => !value)}>
            {showCreate ? 'Hide create form' : 'Create coupon'}
          </Button>
        </div>

        {showCreate ? (
          <form className="admin-create-form" onSubmit={onCreateSubmit} noValidate>
            {createError ? <Alert variant="error" message={createError} /> : null}
            <FormField id="create-coupon-code" label="Code">
              <Input
                id="create-coupon-code"
                value={createForm.code}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    code: event.target.value.toUpperCase(),
                  }))
                }
              />
            </FormField>
            <FormField id="create-discount-type" label="Discount type">
              <select
                id="create-discount-type"
                className="ui-input"
                value={createForm.discount_type}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    discount_type: event.target.value as CouponDiscountType,
                  }))
                }
              >
                <option value="percent">Percent</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </FormField>
            <FormField id="create-discount-value" label="Discount value">
              <Input
                id="create-discount-value"
                type="number"
                min="0.01"
                step="0.01"
                value={createForm.discount_value}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    discount_value: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField id="create-expiry" label="Expiry date (optional)">
              <Input
                id="create-expiry"
                type="date"
                value={createForm.expiry_date ?? ''}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    expiry_date: event.target.value || null,
                  }))
                }
              />
            </FormField>
            <FormField id="create-max-uses" label="Max uses (optional)">
              <Input
                id="create-max-uses"
                type="number"
                min="1"
                value={createForm.max_uses ?? ''}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    max_uses: event.target.value
                      ? Number(event.target.value)
                      : null,
                  }))
                }
              />
            </FormField>
            <FormField
              id="create-max-uses-per-user"
              label="Max uses per user (optional)"
            >
              <Input
                id="create-max-uses-per-user"
                type="number"
                min="1"
                value={createForm.max_uses_per_user ?? ''}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    max_uses_per_user: event.target.value
                      ? Number(event.target.value)
                      : null,
                  }))
                }
              />
            </FormField>
            <Button type="submit" isLoading={createMutation.isPending}>
              Create coupon
            </Button>
          </form>
        ) : null}

        <div className="admin-filters">
          <Input
            aria-label="Search coupons"
            placeholder="Search code"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="ui-input"
            aria-label="Filter by status"
            value={activeFilter}
            onChange={(event) => setActiveFilter(event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            className="ui-input"
            aria-label="Filter by discount type"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="">All types</option>
            <option value="percent">Percent</option>
            <option value="fixed">Fixed</option>
          </select>
        </div>

        {couponsQuery.isLoading ? (
          <Spinner label="Loading coupons..." />
        ) : couponsQuery.isError ? (
          <ErrorState
            title="Could not load coupons"
            description="Administrator coupon list could not be loaded."
            action={
              <Button variant="secondary" onClick={() => couponsQuery.refetch()}>
                Retry
              </Button>
            }
          />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Discount</th>
                  <th scope="col">Expiry</th>
                  <th scope="col">Uses</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {couponsQuery.data?.results.map((coupon) => (
                  <tr key={coupon.id}>
                    <td>{coupon.code}</td>
                    <td>
                      {formatDiscount(coupon.discount_type, coupon.discount_value)}
                    </td>
                    <td>{coupon.expiry_date ?? '—'}</td>
                    <td>
                      {coupon.times_used}
                      {coupon.max_uses != null ? ` / ${coupon.max_uses}` : ''}
                    </td>
                    <td>{coupon.active ? 'Active' : 'Inactive'}</td>
                    <td>
                      <Link className="auth-link" to={`/admin/coupons/${coupon.id}`}>
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {couponsQuery.data?.results.length === 0 ? (
              <p className="home-page__subtitle">No coupons match your filters.</p>
            ) : null}
          </div>
        )}
      </section>
    </main>
  )
}
