import { useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Link, useNavigate } from 'react-router-dom'

import { getAdminCurrentUser, logoutUser } from '../../api/authApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import { toast } from '../../lib/toast'
import { useAuthStore } from '../../store/authStore'

export function AdminDashboardPage() {
  const navigate = useNavigate()
  const refreshToken = useAuthStore((state) => state.refreshToken)
  const storedUser = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const clearSession = useAuthStore((state) => state.clearSession)

  const adminUserQuery = useQuery({
    queryKey: ['auth', 'admin', 'me'],
    queryFn: getAdminCurrentUser,
    retry: false,
  })

  useEffect(() => {
    if (adminUserQuery.data) {
      setUser(adminUserQuery.data)
    }
  }, [adminUserQuery.data, setUser])

  useEffect(() => {
    if (!adminUserQuery.isError || !adminUserQuery.error) {
      return
    }

    const status = isAxiosError(adminUserQuery.error)
      ? adminUserQuery.error.response?.status
      : undefined

    if (status === 401 || status === 403) {
      clearSession({ redirectTo: '/admin/login' })
      navigate('/admin/login', { replace: true })
    }
  }, [adminUserQuery.isError, adminUserQuery.error, clearSession, navigate])

  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (refreshToken) {
        await logoutUser(refreshToken)
      }
    },
    onSettled: () => {
      clearSession({ redirectTo: '/admin/login' })
      toast.success('Signed out')
      navigate('/admin/login', { replace: true })
    },
  })

  const user = adminUserQuery.data ?? storedUser

  return (
    <main className="dashboard-page">
      <section className="dashboard-card" aria-labelledby="admin-dashboard-title">
        <p className="home-page__eyebrow">Administrator</p>
        <h1 id="admin-dashboard-title">Admin dashboard</h1>
        <p className="home-page__subtitle">
          Platform management tools will appear here as marketplace modules come online.
        </p>

        {adminUserQuery.isLoading ? (
          <Spinner label="Verifying administrator access..." />
        ) : adminUserQuery.isError ? (
          <ErrorState
            title="Administrator access denied"
            description="Your account is signed in, but the server rejected administrator access."
            action={
              <Button
                variant="secondary"
                isLoading={adminUserQuery.isFetching}
                onClick={() => adminUserQuery.refetch()}
              >
                Retry
              </Button>
            }
          />
        ) : (
          <>
            <Alert
              variant="success"
              message="Administrator session verified with the server."
            />
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
          </>
        )}

        <div className="dashboard-card__actions">
          <Link className="home-page__cta home-page__cta--secondary" to="/admin/users">
            Manage users
          </Link>
          <Link className="home-page__cta home-page__cta--secondary" to="/profile">
            Edit profile
          </Link>
          <Button
            variant="secondary"
            isLoading={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
          >
            Sign out
          </Button>
        </div>
      </section>
    </main>
  )
}
