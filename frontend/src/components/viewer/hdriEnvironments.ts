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
  { id: 'small-08', label: 'Small Studio 08', hdrPath: '/hdri/small-studio-08.hdr', intensity: 1, yaw: Math.PI / 4 },
  {
    id: 'rogland-sunset',
    label: 'Rogland Sunset',
    hdrPath: '/hdri/rogland_sunset.hdr',
    intensity: 4,
    yaw: Math.PI / 4,
    exposure: 0.6,
    background: { intensity: 1, blur: 0.1 },
    shadowBias: 0.005,
  },
] as const

export const DEFAULT_HDRI_ENVIRONMENT_ID = 'small-09'
