import type { OrderPaymentStatus, OrderStatus } from '../../types/order'
import {
  ORDER_PAYMENT_STATUS_LABELS,
  ORDER_STATUS_LABELS,
} from '../../types/order'

type BadgeVariant = 'neutral' | 'info' | 'active' | 'delivered' | 'success' | 'danger'

const ORDER_STATUS_VARIANT: Record<OrderStatus, BadgeVariant> = {
  pending: 'neutral',
  paid: 'success',
  cancelled: 'danger',
  refunded: 'info',
}

const ORDER_PAYMENT_STATUS_VARIANT: Record<OrderPaymentStatus, BadgeVariant> = {
  pending: 'neutral',
  paid: 'success',
  cancelled: 'danger',
  refunded: 'info',
}

function OrderBadge({
  label,
  variant,
}: {
  label: string
  variant: BadgeVariant
}) {
  return (
    <span className={`status-badge status-badge--${variant}`} aria-label={`Status: ${label}`}>
      {label}
    </span>
  )
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <OrderBadge
      label={ORDER_STATUS_LABELS[status]}
      variant={ORDER_STATUS_VARIANT[status]}
    />
  )
}

export function OrderPaymentStatusBadge({ status }: { status: OrderPaymentStatus }) {
  return (
    <OrderBadge
      label={ORDER_PAYMENT_STATUS_LABELS[status]}
      variant={ORDER_PAYMENT_STATUS_VARIANT[status]}
    />
  )
}
