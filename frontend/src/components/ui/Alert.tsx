interface AlertProps {
  variant: 'success' | 'error'
  message: string
}

export function Alert({ variant, message }: AlertProps) {
  return (
    <div className={`ui-alert ui-alert--${variant}`} role="alert">
      {message}
    </div>
  )
}
