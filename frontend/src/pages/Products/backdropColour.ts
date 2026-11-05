/** Share of the way from the sampled edge colour to white, so the backdrop is clearly lighter. */
export const BACKDROP_LIGHTEN = 0.7

const HEX_COLOUR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i

function parseHex(value: string): [number, number, number] | null {
  const match = HEX_COLOUR.exec(value.trim())
  if (!match) return null
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)]
}

/**
 * One light backdrop colour for a render, made from its stored left and right edge colours.
 * Returns null when either colour is unusable, so the caller keeps the neutral backdrop.
 */
export function backdropColour(left: string, right: string): string | null {
  const a = parseHex(left)
  const b = parseHex(right)
  if (!a || !b) return null
  const channels = a.map((channel, index) => {
    const average = (channel + b[index]) / 2
    return Math.round(average + (255 - average) * BACKDROP_LIGHTEN)
  })
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`
}
