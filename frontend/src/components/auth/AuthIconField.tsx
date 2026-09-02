import { useState, type InputHTMLAttributes } from 'react'

import { FormField } from '../ui/FormField'

type AuthFieldIcon = 'user' | 'mail' | 'lock' | 'phone' | 'globe'

interface AuthIconFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string
  label: string
  error?: string
  icon: AuthFieldIcon
  hasError?: boolean
  revealable?: boolean
}

function FieldIcon({ name }: { name: AuthFieldIcon }) {
  if (name === 'user') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="auth-icon-field__svg">
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm7 9a7 7 0 0 0-14 0"
        />
      </svg>
    )
  }

  if (name === 'mail') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="auth-icon-field__svg">
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          d="M4 6h16v12H4V6Zm0 0 8 7 8-7"
        />
      </svg>
    )
  }

  if (name === 'phone') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="auth-icon-field__svg">
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          d="M7 3h4l1.2 3.2-1.8 1.8a12 12 0 0 0 5.6 5.6l1.8-1.8L21 13v4a2 2 0 0 1-2.2 2 16 16 0 0 1-13.6-13.6A2 2 0 0 1 7 3Z"
        />
      </svg>
    )
  }

  if (name === 'globe') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="auth-icon-field__svg">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.75" />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          d="M3 12h18M12 3c3 3.2 4.5 6.5 4.5 9S15 17.8 12 21c-3-3.2-4.5-6.5-4.5-9S9 6.2 12 3Z"
        />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="auth-icon-field__svg">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6V11Z"
      />
    </svg>
  )
}

export function AuthIconField({
  id,
  label,
  error,
  icon,
  revealable = false,
  type = 'text',
  hasError = false,
  className = '',
  ...inputProps
}: AuthIconFieldProps) {
  const [visible, setVisible] = useState(false)
  const inputType = revealable ? (visible ? 'text' : 'password') : type

  return (
    <FormField id={id} label={label} error={error}>
      <div className={`auth-icon-field${revealable ? ' auth-icon-field--revealable' : ''}`}>
        <span className="auth-icon-field__icon">
          <FieldIcon name={icon} />
        </span>
        <input
          id={id}
          type={inputType}
          className={`ui-input auth-icon-field__input${hasError ? ' ui-input--error' : ''}${
            className ? ` ${className}` : ''
          }`}
          {...inputProps}
        />
        {revealable ? (
          <button
            type="button"
            className="auth-icon-field__reveal"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="auth-icon-field__svg">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"
              />
              <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.75" />
              {visible ? (
                <path fill="none" stroke="currentColor" strokeWidth="1.75" d="M4 20 20 4" />
              ) : null}
            </svg>
          </button>
        ) : null}
      </div>
    </FormField>
  )
}
