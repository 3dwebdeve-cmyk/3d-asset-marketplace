import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Spinner } from './Spinner'

const StartupContext = createContext<{
  active: boolean
  register: () => () => void
} | null>(null)

/** One iframe survives legal, session and lazy-route loading without restarting playback. */
export function StartupPreloader({ children }: { children: ReactNode }) {
  const [dismissed, setDismissed] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )
  const [pending, setPending] = useState(0)
  const [frameLoaded, setFrameLoaded] = useState(false)
  const [displayed, setDisplayed] = useState(false)
  const active = !dismissed

  const register = useCallback(() => {
    setPending(count => count + 1)
    return () => setPending(count => count - 1)
  }, [])

  useEffect(() => {
    if (!active) return
    // An external iframe cannot report when its animation has painted. Bound the wait
    // even when the embed fails, and then expose the app's normal loading/error UI.
    const timeout = window.setTimeout(() => setDismissed(true), 6000)
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const onPreferenceChange = () => {
      if (preference?.matches) setDismissed(true)
    }
    preference?.addEventListener('change', onPreferenceChange)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.clearTimeout(timeout)
      preference?.removeEventListener('change', onPreferenceChange)
      document.body.style.overflow = previousOverflow
    }
  }, [active])

  useEffect(() => {
    if (!active || !frameLoaded) return
    // Give the embed time to initialize and play after its document loads.
    const timeout = window.setTimeout(() => setDisplayed(true), 2000)
    return () => window.clearTimeout(timeout)
  }, [active, frameLoaded])

  useEffect(() => {
    if (active && displayed && pending === 0) setDismissed(true)
  }, [active, displayed, pending])

  return (
    <StartupContext.Provider value={{ active, register }}>
      <div className="site-startup-content" inert={active} aria-hidden={active || undefined}>
        {children}
      </div>
      {active ? <Animation onLoad={() => setFrameLoaded(true)} /> : null}
    </StartupContext.Provider>
  )
}

function Animation({ onLoad }: { onLoad: () => void }) {
  return (
    <div className="site-preloader" role="status" aria-live="polite" aria-busy="true">
      <iframe
        className="site-preloader__animation"
        src="https://lottie.host/embed/488013ff-0d7b-45d3-856c-641ecf29dbb1/VKkkAlq0FN.lottie"
        title="Blue animated icon"
        loading="eager"
        tabIndex={-1}
        aria-hidden="true"
        onLoad={onLoad}
      />
      <p className="site-preloader__label">Loading marketplace...</p>
    </div>
  )
}

/** Track startup work; keep ordinary loading feedback after the initial animation. */
export function Preloader({ label = 'Loading marketplace...' }: { label?: string }) {
  const startup = useContext(StartupContext)
  const register = startup?.register
  useEffect(() => register?.(), [register])

  if (startup?.active) return null
  return <Spinner fullPage label={label} />
}
