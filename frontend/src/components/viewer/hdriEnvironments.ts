export const HDRI_ENVIRONMENTS = [
  { id: 'loft', label: 'Loft Hall', hdrPath: '/hdri/loft-hall.hdr', intensity: 0.85, yaw: Math.PI / 4 },
  {
    id: 'brown',
    label: 'Brown Studio',
    hdrPath: '/hdri/brown-studio.hdr',
    intensity: 1,
    yaw: Math.PI / 4,
    fillLights: [
      { name: 'Lower front', viewYawOffset: -Math.PI / 12, elevation: -Math.PI / 24, intensity: 0.45, width: 4, height: 2 },
      { name: 'Lower right', viewYawOffset: Math.PI / 3, elevation: -Math.PI / 36, intensity: 0.25, width: 3, height: 2 },
    ],
  },
  {
    id: 'small-09',
    label: 'Small Studio 09',
    hdrPath: '/hdri/small-studio-09.hdr',
    intensity: 0.8,
    yaw: Math.PI / 4,
    studio: { ambient: 0.09, keyIntensity: 0.8, keyViewYawOffset: -Math.PI / 3, keyElevation: Math.PI / 9, exposure: 0.9 },
    upperRightLight: { viewYawOffset: Math.PI / 3, elevation: Math.PI / 3 },
  },
  {
    // Light grey-white studio with one huge, soft, round sun (a concave dish) in front of the model, made by
    // scripts/make_custom_hdri.mjs. The sun is painted on the HDRI's +Z axis; `sunFollowsKey` turns the whole
    // map (and the shadow-casting key light) so the sun stays on the viewer's eye line, a little above it,
    // wherever they look from. Alt + drag turns it on top of that.
    id: 'custom-hdri',
    label: 'Custom HDRI',
    hdrPath: '/hdri/custom-hdri.hdr',
    intensity: 1,
    yaw: 0,
    sunFollowsKey: true,
    studio: {
      ambient: 0, // TEMP: was 0.04
      keyIntensity: 0.7,
      keyViewYawOffset: -Math.PI / 12,
      keyElevation: (45 * Math.PI) / 180,
      exposure: 0.9,
      shadowRadius: 6,
    },
    background: { intensity: 3.8, blur: 0.2 },
    contactShadowOpacity: 0.12, // lighter than the other presets so the base does not look dim
    // Starting brightness this preset was tuned with. The shared defaults (contrast -50, exposure -1.1 EV,
    // highlights -32 ...) are meant for the other presets and would flatten and dim this sun.
    viewerDefaults: {
      brightness: 3,
      environment: { contrast: 0, exposure: -0.7, saturation: 0, highlights: 0, shadows: 0, gamma: 0, sharpness: 0 },
    },
  },
  {
    id: 'small-08',
    label: 'Small Studio 08',
    hdrPath: '/hdri/small-studio-08.hdr',
    intensity: 1,
    yaw: Math.PI / 4,
    contactShadowOpacity: 0.75,
    fillLights: [
      { name: 'Lower right fill', viewYawOffset: (5 * Math.PI) / 12, elevation: -Math.PI / 12, intensity: 0.4, width: 3, height: 2 },
    ],
  },
] as const

export const DEFAULT_HDRI_ENVIRONMENT_ID = 'small-09'
