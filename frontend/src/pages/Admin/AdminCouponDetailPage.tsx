import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  deactivateAdminCoupon,
  getAdminCoupon,
  updateAdminCoupon,
} from '../../api/adminCouponsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import type {
  AdminCouponUpdatePayload,
  CouponDiscountType,
} from '../../types/coupon'

export function AdminCouponDetailPage() {
  const { couponId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<AdminCouponUpdatePayload>({})
  const [formError, setFormError] = useState<string | null>(null)

  const couponQuery = useQuery({
    queryKey: ['admin', 'coupons', couponId],
    queryFn: () => getAdminCoupon(couponId),
    enabled: Boolean(couponId),
  })

  useEffect(() => {
    if (!couponQuery.data) {
      return
    }
    setForm({
      code: couponQuery.data.code,
      discount_type: couponQuery.data.discount_type,
      discount_value: couponQuery.data.discount_value,
      expiry_date: couponQuery.data.expiry_date,
      active: couponQuery.data.active,
      max_uses: couponQuery.data.max_uses,
      max_uses_per_user: couponQuery.data.max_uses_per_user,
    })
  }, [couponQuery.data])

  const saveMutation = useMutation({
    mutationFn: (payload: AdminCouponUpdatePayload) =>
      updateAdminCoupon(couponId, payload),
    onSuccess: async () => {
      toast.success('Coupon updated')
      setFormError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] })
      navigate('/console/coupons', { replace: true })
    },
    onError: (error) => {
      setFormError(getApiErrorMessage(error, 'Could not update coupon.'))
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateAdminCoupon(couponId),
    onSuccess: async () => {
      toast.success('Coupon deactivated')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] })
      navigate('/console/coupons', { replace: true })
    },
    onError: (error) => {
      setFormError(getApiErrorMessage(error, 'Could not deactivate coupon.'))
    },
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    saveMutation.mutate({
      ...form,
      code: form.code?.trim().toUpperCase(),
      expiry_date: form.expiry_date || null,
      max_uses: form.max_uses ?? null,
      max_uses_per_user: form.max_uses_per_user ?? null,
    })
  }

  if (couponQuery.isLoading) {
    return (
      <main className="dashboard-page">
        <Spinner label="Loading coupon..." />
      </main>
    )
  }

  if (couponQuery.isError || !couponQuery.data) {
    return (
      <main className="dashboard-page">
        <ErrorState
          title="Coupon not found"
          description="This coupon could not be loaded."
          action={
            <Link className="home-page__cta home-page__cta--secondary" to="/console/coupons">
              Back to coupons
            </Link>
          }
        />
      </main>
    )
  }

  return (
    <main className="dashboard-page">
      <section
        className="dashboard-card dashboard-card--wide"
        aria-labelledby="admin-coupon-detail-title"
      >
        <p className="home-page__eyebrow">Administrator</p>
        <h1 id="admin-coupon-detail-title">{couponQuery.data.code}</h1>
        <p className="home-page__subtitle">
          Used {couponQuery.data.times_used} time
          {couponQuery.data.times_used === 1 ? '' : 's'}.
        </p>

        <form className="admin-create-form" onSubmit={onSubmit} noValidate>
          {formError ? <Alert variant="error" message={formError} /> : null}
          <FormField id="edit-coupon-code" label="Code">
            <Input
              id="edit-coupon-code"
              value={form.code ?? ''}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  code: event.target.value.toUpperCase(),
                }))
              }
            />
          </FormField>
          <FormField id="edit-discount-type" label="Discount type">
            <select
              id="edit-discount-type"
              className="ui-input"
              value={form.discount_type ?? 'percent'}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  discount_type: event.target.value as CouponDiscountType,
                }))
              }
            >
              <option value="percent">Percent</option>
              <option value="fixed">Fixed amount</option>
            </select>
          </FormField>
          <FormField id="edit-discount-value" label="Discount value">
            <Input
              id="edit-discount-value"
              type="number"
              min="0.01"
              step="0.01"
              value={form.discount_value ?? ''}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  discount_value: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField id="edit-expiry" label="Expiry date">
            <Input
              id="edit-expiry"
              type="date"
              value={form.expiry_date ?? ''}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  expiry_date: event.target.value || null,
                }))
              }
            />
          </FormField>
          <FormField id="edit-max-uses" label="Max uses">
            <Input
              id="edit-max-uses"
              type="number"
              min="1"
              value={form.max_uses ?? ''}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  max_uses: event.target.value ? Number(event.target.value) : null,
                }))
              }
            />
          </FormField>
          <FormField id="edit-max-uses-per-user" label="Max uses per user">
            <Input
              id="edit-max-uses-per-user"
              type="number"
              min="1"
              value={form.max_uses_per_user ?? ''}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  max_uses_per_user: event.target.value
                    ? Number(event.target.value)
                    : null,
                }))
              }
            />
          </FormField>
          <FormField id="edit-active" label="Status">
            <select
              id="edit-active"
              className="ui-input"
              value={form.active ? 'true' : 'false'}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  active: event.target.value === 'true',
                }))
              }
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
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
              disabled={!couponQuery.data.active}
            >
              Deactivate
            </Button>
            <Link className="home-page__cta home-page__cta--secondary" to="/console/coupons">
              Back to coupons
            </Link>
          </div>
        </form>
      </section>
    </main>
  )
}
