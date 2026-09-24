import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean
}

export function Input({ hasError = false, className = '', ...props }: InputProps) {
  return (
    <input
      className={`ui-input ${hasError ? 'ui-input--error' : ''} ${className}`.trim()}
      {...props}
    />
  )
}
