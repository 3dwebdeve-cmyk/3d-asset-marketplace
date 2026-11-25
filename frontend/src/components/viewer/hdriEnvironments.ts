export const HDRI_ENVIRONMENTS = [
  { id: 'loft', label: 'Loft Hall', hdrPath: '/hdri/loft-hall.hdr', intensity: 0.85, yaw: Math.PI / 4 },
  { id: 'brown', label: 'Brown Studio', hdrPath: '/hdri/brown-studio.hdr', intensity: 1, yaw: Math.PI / 4 },
  {
    id: 'small-09',
    label: 'Small Studio 09',
    hdrPath: '/hdri/small-studio-09.hdr',
    intensity: 0.8,
    yaw: Math.PI / 4,
    studio: { ambient: 0.09, keyIntensity: 0.8, keyViewYawOffset: -Math.PI / 3, keyElevation: Math.PI / 9, exposure: 0.9 },
    areaLights: [
      { name: 'Fill', yaw: -Math.PI / 4, elevation: Math.PI / 12, intensity: 0.45, size: 4 },
    ],
  },
  { id: 'small-08', label: 'Small Studio 08', hdrPath: '/hdri/small-studio-08.hdr', intensity: 1, yaw: Math.PI / 4 },
  { id: 'quarry-04', label: 'Quarry 04', hdrPath: '/hdri/quarry_04.hdr', intensity: 1.35, yaw: Math.PI / 4, keyColor: '#fff1d9' },
  { id: 'rogland-sunset', label: 'Rogland Sunset', hdrPath: '/hdri/rogland_sunset.hdr', intensity: 1, yaw: Math.PI / 4 },
] as const

export const DEFAULT_HDRI_ENVIRONMENT_ID = 'small-09'
