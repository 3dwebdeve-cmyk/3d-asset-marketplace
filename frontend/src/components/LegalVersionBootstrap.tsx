import { useEffect, useState, type ReactNode } from 'react'
import { loadLegalDocumentVersions } from '../lib/legalDocuments'

export function LegalVersionBootstrap({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    loadLegalDocumentVersions().then(
      () => { if (active) setState('ready') },
      () => { if (active) setState('error') },
    )
    return () => { active = false }
  }, [attempt])
  if (state === 'ready') return children
  return (
    <main className="auth-page" aria-live="polite">
      {state === 'loading' ? <p>Loading marketplace…</p> : (
        <div>
          <p>We couldn’t load the current marketplace terms. Please try again.</p>
          <button onClick={() => { setState('loading'); setAttempt(value => value + 1) }}>Retry</button>
        </div>
      )}
    </main>
  )
}
