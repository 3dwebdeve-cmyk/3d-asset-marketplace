import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Spinner } from './Spinner'

const StartupContext = createContext<{
  active: boolean
  register: () => () => void
} | null>(null)

/** Keep the supplied branded animation mounted throughout the initial loading phases. */
export function StartupPreloader({ children }: { children: ReactNode }) {
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )
  const [dismissed, setDismissed] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )
  const [pending, setPending] = useState(0)
  const [animationLoaded, setAnimationLoaded] = useState(false)
  const [displayed, setDisplayed] = useState(false)
  const [removed, setRemoved] = useState(false)
  const active = !dismissed

  const register = useCallback(() => {
    setPending(count => count + 1)
    return () => setPending(count => count - 1)
  }, [])

  useEffect(() => {
    if (!active) return
    // Always expose the app's loading/error UI if startup takes unusually long.
    const timeout = window.setTimeout(() => setDismissed(true), 6000)
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const onPreferenceChange = () => {
      if (preference?.matches) {
        setReducedMotion(true)
        setDismissed(true)
      }
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
    if (!active || !animationLoaded) return
    // The supplied animation is a two-second loop; allow one cycle after it loads.
    const timeout = window.setTimeout(() => setDisplayed(true), 2000)
    return () => window.clearTimeout(timeout)
  }, [active, animationLoaded])

  useEffect(() => {
    if (active && displayed && pending === 0) setDismissed(true)
  }, [active, displayed, pending])

  useEffect(() => {
    if (!dismissed || reducedMotion) return
    const timeout = window.setTimeout(() => setRemoved(true), 250)
    return () => window.clearTimeout(timeout)
  }, [dismissed, reducedMotion])

  return (
    <StartupContext.Provider value={{ active, register }}>
      <div className="site-startup-content" inert={active} aria-hidden={active || undefined}>
        {children}
      </div>
      {!removed && !reducedMotion ? (
        <Animation
          fading={dismissed}
          onLoad={() => setAnimationLoaded(true)}
          onError={() => setDisplayed(true)}
        />
      ) : null}
    </StartupContext.Provider>
  )
}

function Animation({ fading, onLoad, onError }: {
  fading: boolean
  onLoad: () => void
  onError: () => void
}) {
  return (
    <section
      className={`site-preloader${fading ? ' site-preloader--done' : ''}`}
      role="status"
      aria-label="Loading AssetHive3D"
      aria-live="polite"
      aria-busy={!fading}
      aria-hidden={fading || undefined}
    >
      <div className="site-preloader__stage" aria-hidden="true">
        <img
          src="/images/assethive-preloader.webp"
          title="AssetHive3D animation"
          alt=""
          width={500}
          height={500}
          loading="eager"
          fetchPriority="high"
          onLoad={onLoad}
          onError={onError}
        />
      </div>
      <h2 className="site-preloader__title">AssetHive<span>3D</span></h2>
      <p className="site-preloader__label">Preparing your creative space</p>
      <div className="site-preloader__track" aria-hidden="true" />
    </section>
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
