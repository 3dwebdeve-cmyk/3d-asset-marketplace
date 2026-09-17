import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'

import { getCurrentUser, logoutUser } from '../../api/authApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { toast } from '../../lib/toast'
import { useAuthStore } from '../../store/authStore'
import { useChangePasswordForm } from './useChangePasswordForm'

export function DashboardPage() {
  const navigate = useNavigate()
  const accessToken = useAuthStore((state) => state.accessToken)
  const storedUser = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const clearSession = useAuthStore((state) => state.clearSession)
  const [showChangePassword, setShowChangePassword] = useState(false)

  const currentUserQuery = useQuery({
    queryKey: ['auth', 'me', accessToken],
    queryFn: getCurrentUser,
    enabled: Boolean(accessToken),
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (currentUserQuery.data) {
      setUser(currentUserQuery.data)
    }
  }, [currentUserQuery.data, setUser])

  const logoutMutation = useMutation({
    mutationFn: () => logoutUser(),
    onSettled: () => {
      clearSession({ redirectTo: '/' })
      toast.success('Signed out')
      navigate('/', { replace: true })
    },
  })

  const {
    register,
    handleSubmit,
    errors,
    isSubmitting,
    serverError,
    onSubmit,
  } = useChangePasswordForm({
    onSuccess: () => setShowChangePassword(false),
  })

  const user = currentUserQuery.data ?? storedUser

  return (
    <main className="dashboard-page">
      <section className="dashboard-card" aria-labelledby="dashboard-title">
        <p className="home-page__eyebrow">Customer Dashboard</p>
        <h1 id="dashboard-title">Your account</h1>

        {currentUserQuery.isLoading ? (
          <Spinner label="Loading your profile..." />
        ) : currentUserQuery.isError ? (
          <ErrorState
            title="Could not load your profile"
            description="We could not load your latest profile details. Please try again."
            action={
              <Button
                variant="secondary"
                isLoading={currentUserQuery.isFetching}
                onClick={() => currentUserQuery.refetch()}
              >
                Retry
              </Button>
            }
          />
        ) : (
          <div className="dashboard-card__details">
            <p>
              <strong>Name:</strong> {user?.full_name ?? 'Unavailable'}
            </p>
            <p>
              <strong>Email:</strong> {user?.email ?? 'Unavailable'}
            </p>
            <p>
              <strong>Role:</strong> {user?.role ?? 'Unavailable'}
            </p>
          </div>
        )}

        <div className="dashboard-card__actions">
          <Link
            className="home-page__cta home-page__cta--secondary"
            to="/dashboard/projects"
          >
            My projects
          </Link>
          <Link
            className="home-page__cta home-page__cta--secondary"
            to="/dashboard/wishlist"
          >
            Wishlist
          </Link>
          <Link
            className="home-page__cta home-page__cta--secondary"
            to="/dashboard/orders"
          >
            My orders
          </Link>
          <Link
            className="home-page__cta home-page__cta--secondary"
            to="/dashboard/downloads"
          >
            My downloads
          </Link>
          <Link className="home-page__cta home-page__cta--secondary" to="/profile">
            Edit profile
          </Link>
          <button
            type="button"
            className="home-page__cta home-page__cta--secondary"
            onClick={() => setShowChangePassword((open) => !open)}
            aria-expanded={showChangePassword}
          >
            {showChangePassword ? 'Cancel' : 'Change password'}
          </button>
          <Link className="home-page__cta home-page__cta--secondary" to="/">
            Back to home
          </Link>
          <Button
            className="dashboard-card__logout"
            isLoading={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
          >
            Sign out
          </Button>
        </div>

        {showChangePassword ? (
          <form
            className="auth-form dashboard-password-form"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            aria-label="Change password"
          >
            {serverError ? <Alert variant="error" message={serverError} /> : null}

            <FormField
              id="current_password"
              label="Current password"
              error={errors.current_password?.message}
            >
              <Input
                id="current_password"
                type="password"
                autoComplete="current-password"
                hasError={Boolean(errors.current_password)}
                aria-invalid={Boolean(errors.current_password)}
                aria-describedby={
                  errors.current_password ? 'current_password-error' : undefined
                }
                {...register('current_password')}
              />
            </FormField>

            <FormField
              id="new_password"
              label="New password"
              error={errors.new_password?.message}
            >
              <Input
                id="new_password"
                type="password"
                autoComplete="new-password"
                hasError={Boolean(errors.new_password)}
                aria-invalid={Boolean(errors.new_password)}
                aria-describedby={errors.new_password ? 'new_password-error' : undefined}
                {...register('new_password')}
              />
            </FormField>

            <FormField
              id="new_password_confirm"
              label="Confirm new password"
              error={errors.new_password_confirm?.message}
            >
              <Input
                id="new_password_confirm"
                type="password"
                autoComplete="new-password"
                hasError={Boolean(errors.new_password_confirm)}
                aria-invalid={Boolean(errors.new_password_confirm)}
                aria-describedby={
                  errors.new_password_confirm ? 'new_password_confirm-error' : undefined
                }
                {...register('new_password_confirm')}
              />
            </FormField>

            <Button type="submit" isLoading={isSubmitting}>
              Update password
            </Button>
          </form>
        ) : null}
      </section>
    </main>
  )
}
