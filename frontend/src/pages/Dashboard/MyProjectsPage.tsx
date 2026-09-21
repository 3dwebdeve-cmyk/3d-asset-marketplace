import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { listCustomerCustomProjects } from '../../api/customProjectsApi'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import { StatusBadge } from '../../components/ui/StatusBadge'
import {
  CUSTOM_PROJECT_STATUS_LABELS,
  type CustomerCustomProjectListItem,
} from '../../types/customProject'

const PAGE_SIZE = 20

function formatUpdatedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatQuote(project: CustomerCustomProjectListItem): string {
  if (!project.quotation_amount) return '—'
  return `${project.currency} ${project.quotation_amount}`
}

function formatUnreadBadge(count: number): string {
  if (count > 99) return '99+'
  return String(count)
}

export function MyProjectsPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)

  const projectsQuery = useQuery({
    queryKey: ['customer', 'custom-projects', { page }],
    queryFn: () =>
      listCustomerCustomProjects({
        page,
        page_size: PAGE_SIZE,
      }),
  })

  // If the current page is empty but earlier pages still exist (e.g. last item
  // on page 2 was removed), step back so the user is not stuck with no controls.
  useEffect(() => {
    if (!projectsQuery.isSuccess || !projectsQuery.data) return
    if (
      projectsQuery.data.results.length === 0 &&
      projectsQuery.data.previous &&
      page > 1
    ) {
      setPage((current) => Math.max(1, current - 1))
    }
  }, [projectsQuery.isSuccess, projectsQuery.data, page])

  const results = projectsQuery.data?.results ?? []
  const isTrulyEmpty =
    projectsQuery.isSuccess && (projectsQuery.data?.count ?? 0) === 0

  return (
    <main className="dashboard-page">
      <section
        className="dashboard-card dashboard-card--wide"
        aria-labelledby="my-projects-title"
      >
        <p className="home-page__eyebrow">Customer Dashboard</p>
        <h1 id="my-projects-title">My projects</h1>
        <p className="home-page__subtitle">
          Track your custom 3D project requests, status, and quotations.
        </p>
        <div className="dashboard-card__actions">
          <Link className="home-page__cta" to="/dashboard/projects/new">
            New request
          </Link>
        </div>

        {projectsQuery.isLoading ? (
          <Spinner label="Loading your projects..." />
        ) : projectsQuery.isError ? (
          <ErrorState
            title="Could not load your projects"
            description="Your custom projects could not be loaded. Please try again."
            action={
              <Button
                variant="secondary"
                isLoading={projectsQuery.isFetching}
                onClick={() => projectsQuery.refetch()}
              >
                Retry
              </Button>
            }
          />
        ) : isTrulyEmpty ? (
          <div>
            <p className="home-page__subtitle" role="status">
              You have no custom projects yet.
            </p>
            <div className="dashboard-card__actions">
              <Link className="home-page__cta" to="/dashboard/projects/new">
                Submit your first request
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Title</th>
                    <th scope="col">Status</th>
                    <th scope="col">Updated</th>
                    <th scope="col">Quote</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((project) => {
                    const detailPath = `/dashboard/projects/${project.id}`
                    return (
                      <tr
                        key={project.id}
                        className="admin-table__row--clickable"
                        tabIndex={0}
                        onClick={() => navigate(detailPath)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            navigate(detailPath)
                          }
                        }}
                      >
                        <td>
                          <div className="project-list-title">
                            <Link
                              className="auth-link"
                              to={detailPath}
                              onClick={(event) => event.stopPropagation()}
                            >
                              {project.title}
                            </Link>
                            {project.has_unread ? (
                              <span
                                className="project-unread-badge"
                                aria-label={`${project.unread_count} unread message${project.unread_count === 1 ? '' : 's'}`}
                              >
                                {formatUnreadBadge(project.unread_count)}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <StatusBadge
                            status={project.status}
                            label={CUSTOM_PROJECT_STATUS_LABELS[project.status] ?? project.status}
                          />
                        </td>
                        <td>{formatUpdatedAt(project.updated_at)}</td>
                        <td>{formatQuote(project)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {results.length === 0 ? (
                <p className="home-page__subtitle" role="status">
                  No projects on this page.
                </p>
              ) : null}
            </div>
            <div className="dashboard-card__actions" aria-label="Project pagination">
              <Button
                type="button"
                variant="secondary"
                disabled={!projectsQuery.data?.previous}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                type="button"
                variant="secondary"
                disabled={!projectsQuery.data?.next}
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
