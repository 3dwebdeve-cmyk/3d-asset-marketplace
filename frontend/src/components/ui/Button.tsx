import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
  isLoading?: boolean
}

export function Button({
  variant = 'primary',
  isLoading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const variantClass = variant === 'primary' ? 'ui-button--primary' : 'ui-button--secondary'

  return (
    <button
      type={props.type ?? 'button'}
      className={`ui-button ${variantClass} ${className}`.trim()}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      {...props}
    >
      {isLoading ? 'Please wait…' : children}
    </button>
  )
}
