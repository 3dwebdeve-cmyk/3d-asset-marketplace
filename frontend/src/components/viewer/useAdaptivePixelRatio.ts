import { useEffect, useState } from 'react'

const MOBILE_MAX_DPR = 1.25
const DESKTOP_MAX_DPR = 1.75

/** Mobile / coarse-pointer viewports get lower GPU budgets (DPR + shadows). */
export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return (
    window.matchMedia('(max-width: 639px)').matches ||
    window.matchMedia('(pointer: coarse)').matches
  )
}

/** Caps device pixel ratio for smoother mobile preview performance. */
export function getAdaptivePixelRatio(): number {
  if (typeof window === 'undefined') {
    return 1
  }

  const deviceRatio = window.devicePixelRatio || 1
  const maxRatio = isMobileViewport() ? MOBILE_MAX_DPR : DESKTOP_MAX_DPR
  return Math.min(deviceRatio, maxRatio)
}

/**
 * ContactShadows resolution.
 * Lower maps keep mobile GPUs responsive; desktop stays sharp enough at 1024.
 */
export function getAdaptiveShadowMapSize(): number {
  if (typeof window === 'undefined') {
    return 1024
  }
  return isMobileViewport() ? 512 : 1024
}

export function useAdaptivePixelRatio(): number {
  const [pixelRatio, setPixelRatio] = useState(getAdaptivePixelRatio)

  useEffect(() => {
    const update = () => setPixelRatio(getAdaptivePixelRatio())

    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return pixelRatio
}

export function useAdaptiveShadowMapSize(): number {
  const [mapSize, setMapSize] = useState(getAdaptiveShadowMapSize)

  useEffect(() => {
    const update = () => setMapSize(getAdaptiveShadowMapSize())

    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return mapSize
}
