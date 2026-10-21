import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import { useAuthUiStore, type AuthUiMode } from '../../store/authUiStore'
import { preloadAuthPanels } from './loadAuthPanels'

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
  onPointerEnter,
  onFocus,
  onTouchStart,
  ...rest
}: AuthEntryButtonProps) {
  const location = useLocation()
  const openAuthModal = useAuthUiStore((state) => state.open)

  return (
    <button
      type={type}
      {...rest}
      // Start downloading the sign-in forms as soon as the visitor heads for the button.
      onPointerEnter={(event) => {
        preloadAuthPanels()
        onPointerEnter?.(event)
      }}
      onFocus={(event) => {
        preloadAuthPanels()
        onFocus?.(event)
      }}
      onTouchStart={(event) => {
        preloadAuthPanels()
        onTouchStart?.(event)
      }}
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
