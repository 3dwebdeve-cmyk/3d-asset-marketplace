import { useEffect, useRef, useState, type RefObject } from 'react'

interface ViewportVisibilityResult<T extends HTMLElement> {
  ref: RefObject<T | null>
  visible: boolean
}

/**
 * Tracks whether an element is intersecting the viewport so the viewer can pause
 * rendering while off-screen.
 */
export function useViewportVisibility<T extends HTMLElement>(): ViewportVisibilityResult<T> {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry?.isIntersecting ?? false)
      },
      { threshold: 0.05 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return { ref, visible }
}
