import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { endAdminSession, getAdminSessions, signOutOtherAdminSessions } from '../../api/authApi'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { browserLabel } from '../../lib/browserLabel'
import { formatDateTime } from '../../lib/format'
import { toast } from '../../lib/toast'
import '../../styles/admin-security.css'

const ADMIN_SESSIONS_KEY = ['auth', 'admin', 'sessions']

/**
 * Console -> Security: every browser signed in to this administrator account. Signing one out
 * (or all the others) asks for an authenticator code first; the console prompt handles that.
 */
export function AdminSessionsSection() {
  const queryClient = useQueryClient()
  const sessionsQuery = useQuery({ queryKey: ADMIN_SESSIONS_KEY, queryFn: getAdminSessions })

  const refreshList = () => queryClient.invalidateQueries({ queryKey: ADMIN_SESSIONS_KEY })

  const endMutation = useMutation({
    mutationFn: (sessionId: string) => endAdminSession(sessionId),
    onSuccess: () => {
      toast.success('That browser is signed out.')
      void refreshList()
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Could not sign that browser out.'))
      void refreshList()
    },
  })

  const othersMutation = useMutation({
    mutationFn: () => signOutOtherAdminSessions(),
    onSuccess: (count) => {
      toast.success(
        count === 0
          ? 'No other browsers were signed in.'
          : `${count} other browser${count === 1 ? '' : 's'} signed out.`,
      )
      void refreshList()
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Could not sign the other browsers out.'))
    },
  })

  const sessions = sessionsQuery.data ?? []
  const others = sessions.filter((session) => !session.current)
  const busy = endMutation.isPending || othersMutation.isPending

  return (
    <section className="security-sessions" aria-labelledby="security-sessions-title">
      <div className="security-sessions__header">
        <div>
          <h2 id="security-sessions-title">Signed-in browsers</h2>
          <p className="home-page__subtitle">
            Every browser signed in to your administrator account. Sign out any you do not
            recognise, then change your password.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={busy || others.length === 0}
          isLoading={othersMutation.isPending}
          onClick={() => othersMutation.mutate()}
        >
          Sign out all other browsers
        </Button>
      </div>

      {sessionsQuery.isLoading ? <Spinner label="Loading signed-in browsers..." /> : null}
      {sessionsQuery.isError ? (
        <ErrorState
          title="Could not load signed-in browsers"
          description={getApiErrorMessage(sessionsQuery.error, 'Please try again.')}
          action={
            <Button variant="secondary" onClick={() => void sessionsQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : null}

      {sessions.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Browser</th>
                <th scope="col">Network address</th>
                <th scope="col">Signed in</th>
                <th scope="col">Last active</th>
                <th scope="col">
                  <span className="security-sessions__sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td>
                    <span className="security-sessions__browser" title={session.user_agent}>
                      {browserLabel(session.user_agent)}
                    </span>
                    {session.current ? (
                      <span className="security-sessions__current">This browser</span>
                    ) : null}
                  </td>
                  <td>{session.ip_address || 'Unknown'}</td>
                  <td>{formatDateTime(session.created_at)}</td>
                  <td>{formatDateTime(session.last_used_at)}</td>
                  <td>
                    {session.current ? null : (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        isLoading={endMutation.isPending && endMutation.variables === session.id}
                        aria-label={`Sign out ${browserLabel(session.user_agent)}`}
                        onClick={() => endMutation.mutate(session.id)}
                      >
                        Sign out
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
