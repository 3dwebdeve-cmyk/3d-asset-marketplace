import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { createAdminUser, listAdminUsers } from '../../api/authApi'
import { AdminIcon } from '../../components/admin/AdminIcon'
import { Pagination } from '../../components/ui/Pagination'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import '../../styles/admin-users.css'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import type { AdminUserCreatePayload } from '../../types/auth'

const emptyCreateForm: AdminUserCreatePayload = {
  full_name: '',
  email: '',
  password: '',
  password_confirm: '',
  role: 'Customer',
  phone: '',
  country: '',
}

export function AdminUsersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebouncedValue(search)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<AdminUserCreatePayload>(emptyCreateForm)
  const [createError, setCreateError] = useState<string | null>(null)

  const usersQuery = useQuery({
    queryKey: ['admin', 'users', { search: debouncedSearch, role: roleFilter, statusFilter, page }],
    queryFn: () =>
      listAdminUsers({
        search: debouncedSearch || undefined,
        role: roleFilter || undefined,
        is_active: statusFilter === '' ? undefined : statusFilter === 'active',
        page,
        page_size: 10,
      }),
  })

  const createMutation = useMutation({
    mutationFn: createAdminUser,
    onSuccess: async () => {
      toast.success('User created')
      setCreateForm(emptyCreateForm)
      setShowCreate(false)
      setCreateError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      navigate('/console', { replace: true })
    },
    onError: (error) => {
      setCreateError(getApiErrorMessage(error, 'Could not create user.'))
    },
  })

  const onCreateSubmit = (event: FormEvent) => {
    event.preventDefault()
    setCreateError(null)
    createMutation.mutate(createForm)
  }

  return (
    <main className="dashboard-page admin-users-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="admin-users-title">
        <h1 id="admin-users-title">Users</h1>
        <p className="home-page__subtitle">Create, review, and manage platform accounts.</p>

        {showCreate ? (
          <form className="admin-create-form" onSubmit={onCreateSubmit} noValidate>
            {createError ? <Alert variant="error" message={createError} /> : null}
            <FormField id="create-full-name" label="Full name">
              <Input
                id="create-full-name"
                value={createForm.full_name}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    full_name: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField id="create-email" label="Email">
              <Input
                id="create-email"
                type="email"
                value={createForm.email}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField id="create-role" label="Role">
              <select
                id="create-role"
                className="ui-input"
                value={createForm.role}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    role: event.target.value as AdminUserCreatePayload['role'],
                  }))
                }
              >
                <option value="Customer">Customer</option>
                <option value="Administrator">Administrator</option>
              </select>
            </FormField>
            <FormField id="create-password" label="Password">
              <Input
                id="create-password"
                type="password"
                value={createForm.password}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField id="create-password-confirm" label="Confirm password">
              <Input
                id="create-password-confirm"
                type="password"
                value={createForm.password_confirm}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    password_confirm: event.target.value,
                  }))
                }
              />
            </FormField>
            <Button type="submit" isLoading={createMutation.isPending}>
              Create user
            </Button>
          </form>
        ) : null}

        <div className="admin-filters">
          <Input
            aria-label="Search users"
            placeholder="Search by name or email..."
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1) }}
          />
          <select
            className="ui-input"
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(event) => { setRoleFilter(event.target.value); setPage(1) }}
          >
            <option value="">All roles</option>
            <option value="Customer">Customer</option>
            <option value="Administrator">Administrator</option>
          </select>
          <select className="ui-input" aria-label="Filter by status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}>
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <Button type="button" onClick={() => setShowCreate((value) => !value)}>
            <AdminIcon name="plus-circle" size={16} /> {showCreate ? 'Hide create form' : 'Create user'}
          </Button>
        </div>

        {usersQuery.isLoading ? (
          <Spinner label="Loading users..." />
        ) : usersQuery.isError ? (
          <ErrorState
            title="Could not load users"
            description="Administrator user list could not be loaded."
            action={
              <Button variant="secondary" onClick={() => usersQuery.refetch()}>
                Retry
              </Button>
            }
          />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Verified</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {usersQuery.data?.results.map((user) => (
                  <tr key={user.id}>
                    <td><span className="users-name"><span className={`users-avatar users-avatar--${user.role === 'Administrator' ? 'admin' : user.role === 'Customer' ? 'customer' : 'other'}`}>{(user.full_name || user.email).trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>{user.full_name}</span></td>
                    <td>{user.email}</td>
                    <td><span className={`users-role users-role--${user.role === 'Administrator' ? 'admin' : user.role === 'Customer' ? 'customer' : 'other'}`}>{user.role}</span></td>
                    <td><span className={`users-verified${user.email_verified ? ' users-verified--yes' : ''}`}>{user.email_verified ? 'Yes' : 'No'}</span></td>
                    <td><span className={`users-status${user.is_active ? ' users-status--active' : ''}`}>{user.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <Link className="users-manage" to={`/console/users/${user.id}`}>
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {usersQuery.data?.results.length === 0 ? (
              <p className="home-page__subtitle">No users match your filters.</p>
            ) : null}
            <footer className="users-pagination">
              <span>Showing {usersQuery.data?.count ? (page - 1) * 10 + 1 : 0}-{Math.min((page - 1) * 10 + (usersQuery.data?.results.length ?? 0), usersQuery.data?.count ?? 0)} of {usersQuery.data?.count ?? 0} users</span>
              <Pagination page={page} totalPages={Math.ceil((usersQuery.data?.count ?? 0) / 10)} onPageChange={setPage} ariaLabel="User pagination" />
            </footer>
          </div>
        )}
      </section>
    </main>
  )
}
