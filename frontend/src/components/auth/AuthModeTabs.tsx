import { useAuthUiStore } from '../../store/authUiStore'

interface AuthModeTabsProps {
  active: 'login' | 'register'
}

export function AuthModeTabs({ active }: AuthModeTabsProps) {
  const setMode = useAuthUiStore((state) => state.setMode)

  return (
    <nav className="auth-mode-tabs" aria-label="Sign in or register">
      <button
        type="button"
        className={`auth-mode-tabs__item${
          active === 'login' ? ' auth-mode-tabs__item--active' : ''
        }`}
        aria-current={active === 'login' ? 'true' : undefined}
        onClick={() => setMode('login')}
      >
        Sign In
      </button>
      <button
        type="button"
        className={`auth-mode-tabs__item${
          active === 'register' ? ' auth-mode-tabs__item--active' : ''
        }`}
        aria-current={active === 'register' ? 'true' : undefined}
        onClick={() => setMode('register')}
      >
        Register
      </button>
    </nav>
  )
}
