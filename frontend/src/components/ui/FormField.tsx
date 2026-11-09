import type { ReactNode } from 'react'

interface FormFieldProps {
  id: string
  label: ReactNode
  error?: string
  /** Extra classes for the wrapper, for example to span a full row in a grid form. */
  className?: string
  children: ReactNode
}

export function FormField({ id, label, error, className = '', children }: FormFieldProps) {
  return (
    <div className={`form-field ${className}`.trim()}>
      <label htmlFor={id} className="form-field__label">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="form-field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
