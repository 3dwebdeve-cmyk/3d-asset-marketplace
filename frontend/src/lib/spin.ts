/** A 360° view is exactly this many frames (360/<ID>/360_<ID>_01.jpg ... _36.jpg). */
export const SPIN_FRAME_COUNT = 36

/** True when a product has a full 360° view. */
export function hasSpin(images: readonly string[] | null | undefined): images is string[] {
  return Array.isArray(images) && images.length === SPIN_FRAME_COUNT
}
