import { useEffect, useRef, useState } from 'react'

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: { credential?: string }) => void
            ux_mode?: 'popup' | 'redirect'
            auto_select?: boolean
            cancel_on_tap_outside?: boolean
          }) => void
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon'
              theme?: 'outline' | 'filled_blue' | 'filled_black'
              size?: 'large' | 'medium' | 'small'
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
              shape?: 'rectangular' | 'pill' | 'circle' | 'square'
              width?: number
              logo_alignment?: 'left' | 'center'
            },
          ) => void
        }
      }
    }
  }
}

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) {
    return Promise.resolve()
  }

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_SRC}"]`)
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Sign-In.')), {
        once: true,
      })
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Sign-In.'))
    document.head.appendChild(script)
  })
}

function GoogleMark() {
  return (
    <svg className="auth-google__mark" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
      />
    </svg>
  )
}

interface GoogleSignInButtonProps {
  onCredential: (idToken: string) => void
  disabled?: boolean
  text?: 'signin_with' | 'signup_with' | 'continue_with'
}

export function GoogleSignInButton({
  onCredential,
  disabled = false,
  text = 'continue_with',
}: GoogleSignInButtonProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const onCredentialRef = useRef(onCredential)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? ''

  useEffect(() => {
    onCredentialRef.current = onCredential
  }, [onCredential])

  useEffect(() => {
    if (!clientId || disabled) {
      setReady(false)
      return
    }

    let cancelled = false

    const setup = async () => {
      try {
        await loadGoogleScript()
        if (cancelled || !overlayRef.current || !window.google?.accounts?.id) {
          return
        }

        overlayRef.current.innerHTML = ''
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            const credential = response.credential?.trim()
            if (credential) {
              onCredentialRef.current(credential)
            }
          },
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true,
        })

        const width = Math.max(240, overlayRef.current.offsetWidth || 320)
        window.google.accounts.id.renderButton(overlayRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text,
          shape: 'rectangular',
          width,
          logo_alignment: 'left',
        })
        if (!cancelled) {
          setReady(true)
          setError(null)
        }
      } catch {
        if (!cancelled) {
          setReady(false)
          setError('Google Sign-In could not load. Refresh and try again.')
        }
      }
    }

    void setup()

    return () => {
      cancelled = true
    }
  }, [clientId, disabled, text])

  if (!clientId) {
    return (
      <div className="auth-google">
        <button
          type="button"
          className="auth-google__custom"
          disabled
          title="Google Sign-In is not configured"
        >
          <GoogleMark />
          <span>Continue with Google</span>
        </button>
      </div>
    )
  }

  return (
    <div className={`auth-google${disabled ? ' auth-google--disabled' : ''}`}>
      <div className="auth-google__shell" aria-busy={!ready}>
        <div className="auth-google__custom" aria-hidden="true">
          <GoogleMark />
          <span>Continue with Google</span>
        </div>
        <div ref={overlayRef} className="auth-google__overlay" />
      </div>
      {error ? (
        <p className="auth-google__hint" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
