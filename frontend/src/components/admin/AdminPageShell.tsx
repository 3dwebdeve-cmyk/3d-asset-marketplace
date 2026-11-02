import type { ReactNode } from 'react'

interface AdminPageShellProps {
  titleId: string
  title: string
  subtitle?: ReactNode
  eyebrow?: string
  wide?: boolean
  children: ReactNode
  className?: string
}

/** Shared chrome for administrator pages (eyebrow + title + card). */
export function AdminPageShell({
  titleId,
  title,
  subtitle,
  eyebrow = 'Administrator',
  wide = true,
  children,
  className,
}: AdminPageShellProps) {
  const lastSpace = title.lastIndexOf(' ')
  const titleHead = lastSpace > 0 ? title.slice(0, lastSpace) : ''
  const titleTail = lastSpace > 0 ? title.slice(lastSpace + 1) : title

  const cardClass = [
    'dashboard-card',
    wide ? 'dashboard-card--wide' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <main className="dashboard-page">
      <section className={cardClass} aria-labelledby={titleId}>
        <p className="admin-page__eyebrow">{eyebrow}</p>
        <h1 id={titleId} className="admin-page__title">
          {titleHead ? `${titleHead} ` : ''}
          <span className="admin-page__title-accent">{titleTail}</span>
        </h1>
        {subtitle ? <p className="home-page__subtitle">{subtitle}</p> : null}
        {children}
      </section>
    </main>
  )
}
