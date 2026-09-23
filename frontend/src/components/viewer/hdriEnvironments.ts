export type HdriEnvironmentId = 'studio' | 'natural'

export interface HdriEnvironmentOption {
  id: HdriEnvironmentId
  label: string
  hdrPath: string
  environmentIntensity: number
  /** Multiplier for the viewer's direct lights (not the HDRI). */
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
    hdrPath: '/hdri/studio_small_08_1k.hdr',
    environmentIntensity: 1.05,
    lightMultiplier: 1,
    // Lighting only — visible HDRI reads gray; white solid + white ground stay seamless.
    background: false,
    backgroundBlur: 0.65,
    showGround: true,
  },
  {
    id: 'natural',
    label: 'Natural',
    hdrPath: '/hdri/forest_slope_1k.hdr',
    environmentIntensity: 1.0,
    lightMultiplier: 1,
    background: true,
    backgroundBlur: 0.65,
    showGround: false,
  },
] as const

export const DEFAULT_HDRI_ENVIRONMENT_ID: HdriEnvironmentId = 'studio'
