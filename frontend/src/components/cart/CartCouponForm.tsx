import { useState } from 'react'
import type { FormEvent } from 'react'

import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { FormField } from '../ui/FormField'
import { Input } from '../ui/Input'
import type { AppliedCoupon } from '../../types/cart'

interface CartCouponFormProps {
  coupon: AppliedCoupon | null
  isPending: boolean
  error: string | null
  onApply: (code: string) => void
  onRemove: () => void
  onClearError?: () => void
  compact?: boolean
}

export function CartCouponForm({
  coupon,
  isPending,
  error,
  onApply,
  onRemove,
  onClearError,
  compact = false,
}: CartCouponFormProps) {
  const [code, setCode] = useState('')

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const normalized = code.trim()
    if (!normalized) {
      return
    }
    onClearError?.()
    onApply(normalized)
  }

  if (coupon) {
    return (
      <div className={compact ? 'cart-coupon cart-coupon--compact' : 'cart-coupon'}>
        <p className="cart-coupon__applied" role="status">
          Coupon <strong>{coupon.code}</strong> applied
          {coupon.discount_type === 'percent'
            ? ` (${coupon.discount_value}% off)`
            : ` ($${coupon.discount_value} off)`}
        </p>
        <Button
          type="button"
          variant="secondary"
          isLoading={isPending}
          onClick={onRemove}
        >
          Remove coupon
        </Button>
      </div>
    )
  }

  return (
    <form
      className={compact ? 'cart-coupon cart-coupon--compact' : 'cart-coupon'}
      onSubmit={onSubmit}
      noValidate
    >
      {error ? <Alert variant="error" message={error} /> : null}
      <FormField id={compact ? 'drawer-coupon-code' : 'cart-coupon-code'} label="Coupon code">
        <div className="cart-coupon__row">
          <Input
            id={compact ? 'drawer-coupon-code' : 'cart-coupon-code'}
            value={code}
            autoComplete="off"
            spellCheck={false}
            placeholder="Enter code"
            disabled={isPending}
            onChange={(event) => {
              onClearError?.()
              setCode(event.target.value.toUpperCase())
            }}
          />
          <Button type="submit" isLoading={isPending} disabled={!code.trim()}>
            Apply
          </Button>
        </div>
      </FormField>
    </form>
  )
}
