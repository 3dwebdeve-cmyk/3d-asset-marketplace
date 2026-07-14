import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="ui-state" role="status">
      <h2 className="ui-state__title">{title}</h2>
      {description ? <p className="ui-state__description">{description}</p> : null}
      {action ? <div className="ui-state__action">{action}</div> : null}
    </div>
  )
}
