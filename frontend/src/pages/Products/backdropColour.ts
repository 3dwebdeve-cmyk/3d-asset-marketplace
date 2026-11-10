const HEX_COLOUR = /^#[0-9a-f]{6}$/i

/** Only use valid stored colours; older images can fall back to the neutral backdrop. */
export function backdropColour(value: string | undefined): string | undefined {
  const colour = value?.trim()
  return colour && HEX_COLOUR.test(colour) ? colour : undefined
}
