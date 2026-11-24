export const HDRI_ENVIRONMENTS = [
  { id: 'loft', label: 'Loft Hall', hdrPath: '/hdri/loft-hall.hdr', intensity: 0.85, yaw: Math.PI / 4 },
  { id: 'brown', label: 'Brown Studio', hdrPath: '/hdri/brown-studio.hdr', intensity: 1, yaw: Math.PI / 4 },
  {
    id: 'small-09',
    label: 'Small Studio 09',
    hdrPath: '/hdri/small-studio-09.hdr',
    intensity: 0.8,
    yaw: Math.PI / 4,
    studio: { ambient: 0.09, keyIntensity: 0.8, keyYawOffset: -Math.PI / 6, exposure: 0.9 },
  },
  { id: 'small-08', label: 'Small Studio 08', hdrPath: '/hdri/small-studio-08.hdr', intensity: 1, yaw: Math.PI / 4 },
  {
    // Neutral product studio: one soft key from the front-left at 60 degrees, a white studio room
    // for wrap-around fill and reflections, and colour-accurate tone mapping. Yaw is relative to
    // the camera's front view, so every model gets the same look after it is fitted to 1.8 units.
    id: 'light-111', label: 'Light 111', hdrPath: null, intensity: 1, yaw: 0,
    productStudio: {
      key: { yaw: -Math.PI / 4, elevation: Math.PI / 3, intensity: 1.3 },
      roomColor: '#2b2b2b',
      panels: [
        { name: 'Overhead', yaw: 0, elevation: Math.PI * 0.45, intensity: 1.4, scale: [6, 6] },
        { name: 'Key softbox', yaw: -Math.PI / 4, elevation: Math.PI / 3, intensity: 2.4, scale: [3, 3] },
        { name: 'Right fill', yaw: Math.PI / 2, elevation: Math.PI / 18, intensity: 0.55, scale: [2.5, 4] },
        { name: 'Rim', yaw: Math.PI, elevation: Math.PI / 5, intensity: 0.9, scale: [5, 1.5] },
        { name: 'Floor bounce', yaw: 0, elevation: -Math.PI / 3, intensity: 0.3, scale: [8, 8] },
      ],
      floorShadowOpacity: 0.22,
    },
  },
] as const

export const DEFAULT_HDRI_ENVIRONMENT_ID = 'small-09'

/** World position at `distance` from the origin for an azimuth (radians around Y) and elevation above the floor. */
export function orbitPosition(azimuth: number, elevation: number, distance: number): [number, number, number] {
  const radius = distance * Math.cos(elevation)
  return [Math.sin(azimuth) * radius, distance * Math.sin(elevation), Math.cos(azimuth) * radius]
}
