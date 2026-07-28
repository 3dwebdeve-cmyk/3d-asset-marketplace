import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { listAdminUsers } from '../../api/authApi'
import {
  createAdminOrder,
  listAdminOrders,
} from '../../api/ordersApi'
import { listAdminPlugins } from '../../api/pluginsApi'
import { listAdminProducts } from '../../api/productsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import type {
  AdminOrderCreatePayload,
  AdminOrderItemCreatePayload,
  OrderOrdering,
  OrderPaymentStatus,
  OrderStatus,
} from '../../types/order'
import {
  ORDER_PAYMENT_STATUS_LABELS,
  ORDER_STATUS_LABELS,
} from '../../types/order'

interface CreateLineItemDraft {
  key: string
  product_type: AdminOrderItemCreatePayload['product_type']
  product_id: string
  quantity: string
}

const emptyLineItem = (): CreateLineItemDraft => ({
  key: crypto.randomUUID(),
  product_type: 'product',
  product_id: '',
  quantity: '1',
})

function validateCreate(
  customerId: string,
  currency: string,
  items: CreateLineItemDraft[],
): string | null {
  if (!customerId) return 'Select a customer.'
  if (!/^[A-Za-z]{3}$/.test(currency.trim())) {
    return 'Currency must be a 3-letter code.'
  }
  if (items.length === 0) return 'Add at least one line item.'
  for (const [index, item] of items.entries()) {
    if (!item.product_id) {
      return `Select a catalog item for line ${index + 1}.`
    }
    const quantity = Number(item.quantity)
    if (!Number.isInteger(quantity) || quantity < 1) {
      return `Enter a valid quantity (1+) for line ${index + 1}.`
    }
  }
  const seen = new Set<string>()
  for (const item of items) {
    const key = `${item.product_type}:${item.product_id}`
    if (seen.has(key)) {
      return 'Each product or plugin can only appear once per order.'
    }
    seen.add(key)
  }
  return null
}

function formatMoney(amount: string, currency: string): string {
  return `${currency} ${amount}`
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function AdminOrdersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [orderStatus, setOrderStatus] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [ordering, setOrdering] = useState<OrderOrdering>('-created_at')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [lineItems, setLineItems] = useState<CreateLineItemDraft[]>([emptyLineItem()])
  const [createError, setCreateError] = useState<string | null>(null)
  const debouncedSearch = useDebouncedValue(search)

  const ordersQuery = useQuery({
    queryKey: [
      'admin',
      'orders',
      { search: debouncedSearch, orderStatus, paymentStatus, ordering, page },
    ],
    queryFn: () =>
      listAdminOrders({
        search: debouncedSearch || undefined,
        order_status: (orderStatus || undefined) as OrderStatus | undefined,
        payment_status: (paymentStatus || undefined) as
          | OrderPaymentStatus
          | undefined,
        ordering,
        page,
        page_size: 20,
      }),
  })
  const customersQuery = useQuery({
    queryKey: ['admin', 'users', 'customers-options'],
    queryFn: () => listAdminUsers({ role: 'Customer', page_size: 100, is_active: true }),
    enabled: showCreate,
  })
  const productsQuery = useQuery({
    queryKey: ['admin', 'products', 'order-create-options'],
    queryFn: () => listAdminProducts({ status: 'published', page_size: 100 }),
    enabled: showCreate,
  })
  const pluginsQuery = useQuery({
    queryKey: ['admin', 'plugins', 'order-create-options'],
    queryFn: () => listAdminPlugins({ status: 'published', page_size: 100 }),
    enabled: showCreate,
  })
  const createMutation = useMutation({
    mutationFn: createAdminOrder,
    onSuccess: async (order) => {
      toast.success('Order created')
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'orders'],
        refetchType: 'none',
      })
      navigate(`/admin/orders/${order.id}`, { replace: true })
    },
    onError: (error) =>
      setCreateError(getApiErrorMessage(error, 'Could not create order.')),
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const validationError = validateCreate(customerId, currency, lineItems)
    setCreateError(validationError)
    if (validationError) return
    const payload: AdminOrderCreatePayload = {
      customer_id: customerId,
      currency: currency.trim().toUpperCase(),
      items: lineItems.map((item) => ({
        product_type: item.product_type,
        product_id: item.product_id,
        quantity: Number(item.quantity),
      })),
    }
    createMutation.mutate(payload)
  }

  const resetPage = () => setPage(1)
  const customers = customersQuery.data?.results ?? []
  const products = productsQuery.data?.results ?? []
  const plugins = pluginsQuery.data?.results ?? []
  const catalogLoading =
    productsQuery.isLoading || pluginsQuery.isLoading || customersQuery.isLoading
  const catalogError =
    productsQuery.isError || pluginsQuery.isError || customersQuery.isError

  return (
    <main className="dashboard-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="orders-title">
        <p className="home-page__eyebrow">Administrator</p>
        <h1 id="orders-title">Orders</h1>
        <p className="home-page__subtitle">
          Review marketplace orders, inspect line items, and create manual orders.
        </p>
        <div className="dashboard-card__actions">
          <Button type="button" onClick={() => setShowCreate((value) => !value)}>
            {showCreate ? 'Hide create form' : 'Create order for customer'}
          </Button>
        </div>

        {showCreate ? (
          <form className="admin-create-form" onSubmit={onSubmit} noValidate>
            {createError ? <Alert variant="error" message={createError} /> : null}
            <FormField id="order-customer" label="Customer">
              <select
                id="order-customer"
                className="ui-input"
                value={customerId}
                disabled={customersQuery.isLoading || customersQuery.isError}
                onChange={(event) => setCustomerId(event.target.value)}
              >
                <option value="">
                  {customersQuery.isLoading ? 'Loading customers...' : 'Select a customer'}
                </option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.full_name} ({customer.email})
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="order-currency" label="Currency">
              <Input
                id="order-currency"
                value={currency}
                maxLength={3}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
              />
            </FormField>

            <div className="admin-create-form__items" aria-label="Order line items">
              {lineItems.map((item, index) => {
                const catalogOptions =
                  item.product_type === 'product' ? products : plugins
                return (
                  <div key={item.key} className="admin-create-form__item-row">
                    <FormField id={`order-item-type-${item.key}`} label={`Type (line ${index + 1})`}>
                      <select
                        id={`order-item-type-${item.key}`}
                        className="ui-input"
                        value={item.product_type}
                        onChange={(event) => {
                          const product_type = event.target.value as
                            | 'product'
                            | 'plugin'
                          setLineItems((current) =>
                            current.map((row) =>
                              row.key === item.key
                                ? { ...row, product_type, product_id: '' }
                                : row,
                            ),
                          )
                        }}
                      >
                        <option value="product">Product</option>
                        <option value="plugin">Plugin</option>
                      </select>
                    </FormField>
                    <FormField
                      id={`order-item-catalog-${item.key}`}
                      label={item.product_type === 'product' ? 'Product' : 'Plugin'}
                    >
                      <select
                        id={`order-item-catalog-${item.key}`}
                        className="ui-input"
                        value={item.product_id}
                        disabled={catalogLoading || catalogError}
                        onChange={(event) =>
                          setLineItems((current) =>
                            current.map((row) =>
                              row.key === item.key
                                ? { ...row, product_id: event.target.value }
                                : row,
                            ),
                          )
                        }
                      >
                        <option value="">
                          {catalogLoading
                            ? 'Loading catalog...'
                            : `Select a ${item.product_type}`}
                        </option>
                        {catalogOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name} ({option.currency} {option.price})
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField id={`order-item-qty-${item.key}`} label="Quantity">
                      <Input
                        id={`order-item-qty-${item.key}`}
                        type="number"
                        min={1}
                        step={1}
                        value={item.quantity}
                        onChange={(event) =>
                          setLineItems((current) =>
                            current.map((row) =>
                              row.key === item.key
                                ? { ...row, quantity: event.target.value }
                                : row,
                            ),
                          )
                        }
                      />
                    </FormField>
                    {lineItems.length > 1 ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setLineItems((current) =>
                            current.filter((row) => row.key !== item.key),
                          )
                        }
                      >
                        Remove line
                      </Button>
                    ) : null}
                  </div>
                )
              })}
              <Button
                type="button"
                variant="secondary"
                onClick={() => setLineItems((current) => [...current, emptyLineItem()])}
              >
                Add line item
              </Button>
            </div>
            {catalogError ? (
              <Alert variant="error" message="Customers or catalog options could not be loaded." />
            ) : null}
            <Button type="submit" isLoading={createMutation.isPending}>
              Create order
            </Button>
          </form>
        ) : null}

        <div className="admin-filters">
          <Input
            aria-label="Search orders"
            placeholder="Search invoice number or customer email"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              resetPage()
            }}
          />
          <select
            className="ui-input"
            aria-label="Filter by order status"
            value={orderStatus}
            onChange={(event) => {
              setOrderStatus(event.target.value)
              resetPage()
            }}
          >
            <option value="">All order statuses</option>
            {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((status) => (
              <option key={status} value={status}>
                {ORDER_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <select
            className="ui-input"
            aria-label="Filter by payment status"
            value={paymentStatus}
            onChange={(event) => {
              setPaymentStatus(event.target.value)
              resetPage()
            }}
          >
            <option value="">All payment statuses</option>
            {(Object.keys(ORDER_PAYMENT_STATUS_LABELS) as OrderPaymentStatus[]).map(
              (status) => (
                <option key={status} value={status}>
                  {ORDER_PAYMENT_STATUS_LABELS[status]}
                </option>
              ),
            )}
          </select>
          <select
            className="ui-input"
            aria-label="Order orders"
            value={ordering}
            onChange={(event) => {
              setOrdering(event.target.value as OrderOrdering)
              resetPage()
            }}
          >
            <option value="-created_at">Newest first</option>
            <option value="created_at">Oldest first</option>
            <option value="-total_amount">Highest total</option>
            <option value="total_amount">Lowest total</option>
            <option value="invoice_number">Invoice A–Z</option>
            <option value="-invoice_number">Invoice Z–A</option>
            <option value="order_status">Order status A–Z</option>
            <option value="-order_status">Order status Z–A</option>
            <option value="payment_status">Payment status A–Z</option>
            <option value="-payment_status">Payment status Z–A</option>
          </select>
        </div>

        {ordersQuery.isLoading ? (
          <Spinner label="Loading orders..." />
        ) : ordersQuery.isError ? (
          <ErrorState
            title="Could not load orders"
            description="Administrator order list could not be loaded."
            action={
              <Button variant="secondary" onClick={() => ordersQuery.refetch()}>
                Retry
              </Button>
            }
          />
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Total</th>
                    <th>Order status</th>
                    <th>Payment</th>
                    <th>Items</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersQuery.data?.results.map((order) => (
                    <tr key={order.id}>
                      <td>{order.invoice_number}</td>
                      <td>
                        <div>{order.customer.full_name}</div>
                        <div className="home-page__subtitle">{order.customer.email}</div>
                      </td>
                      <td>{formatMoney(order.total_amount, order.currency)}</td>
                      <td>{ORDER_STATUS_LABELS[order.order_status]}</td>
                      <td>{ORDER_PAYMENT_STATUS_LABELS[order.payment_status]}</td>
                      <td>{order.item_count}</td>
                      <td>{formatDate(order.created_at)}</td>
                      <td>
                        <Link className="auth-link" to={`/admin/orders/${order.id}`}>
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ordersQuery.data?.results.length === 0 ? (
                <p className="home-page__subtitle">No orders match your filters.</p>
              ) : null}
            </div>
            <div className="dashboard-card__actions" aria-label="Order pagination">
              <Button
                type="button"
                variant="secondary"
                disabled={!ordersQuery.data?.previous}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                type="button"
                variant="secondary"
                disabled={!ordersQuery.data?.next}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
