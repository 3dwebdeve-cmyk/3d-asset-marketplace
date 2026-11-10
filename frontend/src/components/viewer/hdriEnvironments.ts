export type HdriEnvironmentId = 'studio'

export interface HdriEnvironmentOption {
  id: HdriEnvironmentId
  label: string
  hdrPath: string
  environmentIntensity: number
  /** Multiplier for studio direct lights (not the HDRI). */
  lightMultiplier: number
  background: boolean
  /** Blur applied to the visible HDRI backdrop only (0 = sharp, 1 = very blurred). */
  backgroundBlur: number
  /** Show a ground plane under the model for this environment preset. */
  showGround: boolean
}

export const HDRI_ENVIRONMENTS: readonly HdriEnvironmentOption[] = [
  {
    id: 'studio',
    label: 'Studio',
    // Derived from the supplied 4K master; cap runtime resolution so environment
    // convolution does not block startup on mobile GPUs or software rendering.
    hdrPath: '/hdri/studio_kominka_01_1k.exr',
    environmentIntensity: 1.0,
    lightMultiplier: 1,
    // Use the EXR for lighting/reflections; a neutral backdrop hides its dark studio areas.
    background: false,
    backgroundBlur: 0.65,
    showGround: true,
  },
] as const

export const DEFAULT_HDRI_ENVIRONMENT_ID: HdriEnvironmentId = 'studio'
