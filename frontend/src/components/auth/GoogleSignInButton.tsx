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
  const buttonRef = useRef<HTMLDivElement>(null)
  const onCredentialRef = useRef(onCredential)
  const [error, setError] = useState<string | null>(null)
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? ''

  useEffect(() => {
    onCredentialRef.current = onCredential
  }, [onCredential])

  useEffect(() => {
    if (!clientId || disabled) {
      return
    }

    let cancelled = false

    const setup = async () => {
      try {
        await loadGoogleScript()
        if (cancelled || !buttonRef.current || !window.google?.accounts?.id) {
          return
        }

        buttonRef.current.innerHTML = ''
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

        const width = Math.min(320, Math.max(240, buttonRef.current.offsetWidth || 280))
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text,
          shape: 'rectangular',
          width,
          logo_alignment: 'left',
        })
        setError(null)
      } catch {
        if (!cancelled) {
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
      <p className="auth-google__hint" role="status">
        Google Sign-In is not configured.
      </p>
    )
  }

  return (
    <div className={`auth-google${disabled ? ' auth-google--disabled' : ''}`}>
      <div ref={buttonRef} className="auth-google__button" />
      {error ? (
        <p className="auth-google__hint" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
