import { useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'

import { getCurrentUser, logoutUser } from '../../api/authApi'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import { toast } from '../../lib/toast'
import { useAuthStore } from '../../store/authStore'

export function DashboardPage() {
  const navigate = useNavigate()
  const refreshToken = useAuthStore((state) => state.refreshToken)
  const storedUser = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const clearSession = useAuthStore((state) => state.clearSession)

  const currentUserQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getCurrentUser,
  })

  useEffect(() => {
    if (currentUserQuery.data) {
      setUser(currentUserQuery.data)
    }
  }, [currentUserQuery.data, setUser])

  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (refreshToken) {
        await logoutUser(refreshToken)
      }
    },
    onSettled: () => {
      clearSession()
      toast.success('Signed out')
      navigate('/login', { replace: true })
    },
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
      </section>
    </main>
  )
}
