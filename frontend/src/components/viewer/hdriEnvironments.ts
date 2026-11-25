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
    // scripts/make_custom_hdri.mjs.
    // The sun sits on the HDRI's +Z axis and `sunFollowsKey` turns the map so it lines up with the
    // shadow-casting key light, which sits in line with the opening camera (front light from the viewer's side), just above the horizon.
    // From the opening angle that lights everything the viewer can see: the front, both sides and the top.
    id: 'custom-hdri',
    label: 'Custom HDRI',
    hdrPath: '/hdri/custom-hdri.hdr',
    intensity: 1,
    yaw: 0,
    sunFollowsKey: true,
    studio: {
      ambient: 0, // off on purpose: the HDRI sun is the only light
      keyIntensity: 0, // off on purpose: the HDRI sun is the only light (shadow light kept for its angle)
      keyViewYawOffset: 0, // sun sits in line with the camera (front light from the viewer's side)
      keyElevation: (20 * Math.PI) / 180,
      exposure: 0.9,
      shadowRadius: 6,
      contactShadowOpacity: 0.12,
    },
    background: { intensity: 3.8, blur: 0.2 },
  },
  { id: 'small-08', label: 'Small Studio 08', hdrPath: '/hdri/small-studio-08.hdr', intensity: 1, yaw: Math.PI / 4 },
] as const

export const DEFAULT_HDRI_ENVIRONMENT_ID = 'small-09'
