import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Route changes keep the previous window offset, and a focused footer or nav
 * link is scrolled back into view. Start every page at the top.
 */
export function ScrollToTop() {
  const { pathname } = useLocation()

  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }

    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body) {
      active.blur()
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    const scrollingElement = document.scrollingElement
    if (scrollingElement) {
      scrollingElement.scrollTop = 0
    }
  }, [pathname])

  return null
}
