export const HDRI_ENVIRONMENTS = [
  { id: 'loft', label: 'Loft Hall', hdrPath: '/hdri/loft-hall.hdr', intensity: 0.85, yaw: Math.PI / 4 },
  { id: 'brown', label: 'Brown Studio', hdrPath: '/hdri/brown-studio.hdr', intensity: 1, yaw: Math.PI / 4 },
  { id: 'small-09', label: 'Small Studio 09', hdrPath: '/hdri/small-studio-09.hdr', intensity: 0.9, yaw: Math.PI / 4 },
  { id: 'small-08', label: 'Small Studio 08', hdrPath: '/hdri/small-studio-08.hdr', intensity: 1, yaw: Math.PI / 4 },
] as const

export const DEFAULT_HDRI_ENVIRONMENT_ID = 'small-09'
