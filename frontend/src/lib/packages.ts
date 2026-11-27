/**
 * The packages a model is sold in, in the order every screen lists them.
 * The one frontend copy of backend/products/packages.py (PackageKind): keep the two equal.
 */
export const PACKAGE_ORDER = [
  'with_light_rig',
  'without_light_rig',
  'glb_only',
  '3ds_max',
  'environment',
  'whole',
] as const

export type PackageKind = (typeof PACKAGE_ORDER)[number]

export const PACKAGE_LABELS: Record<PackageKind, string> = {
  with_light_rig: 'With Light Rig',
  without_light_rig: 'Without Light Rig',
  glb_only: 'GLB Only',
  '3ds_max': '3ds Max',
  environment: 'With Environment',
  whole: 'Whole File',
}

/** The packages an admin prices: every package but Whole File, which All variations sells. */
export type PricedKind = Exclude<PackageKind, 'whole'>

export const PRICED_KINDS: PricedKind[] = PACKAGE_ORDER.filter((kind): kind is PricedKind => kind !== 'whole')

/** What a cart or order line is: one package of a model, or All variations (every package). */
export type LineKind = PackageKind | 'bundle'

export const LINE_LABELS: Record<LineKind, string> = {
  ...PACKAGE_LABELS,
  bundle: 'All variations',
}

/** Package rows (files with a kind), in PACKAGE_ORDER. */
export function sortedPackages<T extends { package_kind: PackageKind | '' }>(files: readonly T[]): T[] {
  return files
    .filter((file) => file.package_kind !== '')
    .sort(
      (a, b) =>
        PACKAGE_ORDER.indexOf(a.package_kind as PackageKind) -
        PACKAGE_ORDER.indexOf(b.package_kind as PackageKind),
    )
}
