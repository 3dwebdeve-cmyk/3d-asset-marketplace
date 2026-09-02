import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import { useAuthUiStore, type AuthUiMode } from '../../store/authUiStore'

interface AuthEntryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  mode: AuthUiMode
  returnTo?: string | null
  children: ReactNode
}

export function AuthEntryButton({
  mode,
  returnTo,
  children,
  type = 'button',
  onClick,
  ...rest
}: AuthEntryButtonProps) {
  const location = useLocation()
  const openAuthModal = useAuthUiStore((state) => state.open)

  return (
    <button
      type={type}
      {...rest}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) {
          return
        }
        openAuthModal({
          mode,
          returnTo: returnTo ?? location.pathname,
        })
      }}
    >
      {children}
    </button>
  )
}
