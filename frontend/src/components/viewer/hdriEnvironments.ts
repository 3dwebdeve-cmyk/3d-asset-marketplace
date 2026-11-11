export type HdriEnvironmentId = 'studio' | 'natural'

export interface HdriEnvironmentOption {
  id: HdriEnvironmentId
  label: string
  hdrPath: string
  environmentIntensity: number
  /** Multiplier for studio direct lights (not the HDRI); unused in Natural mode. */
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
    // Keep the runtime panorama small enough for mobile GPUs and software rendering.
    hdrPath: '/hdri/studio.exr',
    environmentIntensity: 1.0,
    lightMultiplier: 1,
    // Use the EXR for lighting/reflections; a neutral backdrop hides its dark studio areas.
    background: false,
    backgroundBlur: 0.65,
    showGround: true,
  },
  {
    id: 'natural',
    label: 'Natural',
    hdrPath: '/hdri/forest_slope_1k.hdr',
    environmentIntensity: 1.0,
    lightMultiplier: 0,
    background: true,
    backgroundBlur: 0.65,
    showGround: false,
  },
] as const

export const DEFAULT_HDRI_ENVIRONMENT_ID: HdriEnvironmentId = 'studio'
