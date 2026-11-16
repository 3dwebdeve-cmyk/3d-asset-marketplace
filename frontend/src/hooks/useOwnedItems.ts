import { queryOptions, useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

import { listDownloadEntitlements } from '../api/downloadsApi'
import type { PackageKind } from '../lib/packages'
import { isAdministrator } from '../lib/roles'
import { useAuthStore } from '../store/authStore'
import type { CartProductType } from '../types/cart'

/** The signed-in customer's library: what they paid for and can download. Shared with Downloads. */
export const entitlementsQuery = queryOptions({
  queryKey: ['downloads', 'entitlements'],
  queryFn: listDownloadEntitlements,
  staleTime: 60_000,
})

const NO_PACKAGES: ReadonlySet<PackageKind> = new Set()

/**
 * What the signed-in customer already owns, so pages offer the download, not a second purchase:
 * a plugin, or the packages of a model (Whole File, or an order from before packages, owns all).
 */
export function useOwnedItems() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const accessToken = useAuthStore((state) => state.accessToken)
  const role = useAuthStore((state) => state.user?.role)
  const isCustomer = isAuthenticated && Boolean(accessToken) && !isAdministrator(role)

  const query = useQuery({ ...entitlementsQuery, enabled: isCustomer })

  const owned = useMemo(
    () => new Set((query.data ?? []).map((item) => `${item.product_type}:${item.product_id}`)),
    [query.data],
  )
  const packages = useMemo(
    () =>
      new Map(
        (query.data ?? [])
          .filter((item) => item.product_type === 'product')
          .map((item) => [item.product_id, new Set(item.package_kinds)] as const),
      ),
    [query.data],
  )
  /** A plugin the user bought, or a model they own at least one package of. */
  const isOwned = useCallback(
    (type: CartProductType, id: string) => owned.has(`${type}:${id}`),
    [owned],
  )
  /** The packages of a model the user owns. */
  const ownedPackages = useCallback(
    (productId: string): ReadonlySet<PackageKind> => packages.get(productId) ?? NO_PACKAGES,
    [packages],
  )

  return { isOwned, ownedPackages }
}
