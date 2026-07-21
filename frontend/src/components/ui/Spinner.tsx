interface SpinnerProps {
  label?: string
  size?: 'sm' | 'md' | 'lg'
  fullPage?: boolean
}

export function Spinner({ label = 'Loading...', size = 'md', fullPage = false }: SpinnerProps) {
  const indicator = (
    <span className={`ui-spinner ui-spinner--${size}`} role="status" aria-live="polite">
      <span className="ui-spinner__circle" aria-hidden="true" />
      <span className="ui-spinner__label">{label}</span>
    </span>
  )

  if (fullPage) {
    return <div className="ui-spinner-page">{indicator}</div>
  }

  return indicator
}
