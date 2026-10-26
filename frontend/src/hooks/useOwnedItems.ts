import { queryOptions, useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

import { listDownloadEntitlements } from '../api/downloadsApi'
import { isAdministrator } from '../lib/roles'
import { useAuthStore } from '../store/authStore'
import type { CartProductType } from '../types/cart'

/** The signed-in customer's library: what they paid for and can download. Shared with Downloads. */
export const entitlementsQuery = queryOptions({
  queryKey: ['downloads', 'entitlements'],
  queryFn: listDownloadEntitlements,
  staleTime: 60_000,
})

/** Whether the signed-in customer already owns an item, so pages offer the download, not a second purchase. */
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
  const isOwned = useCallback(
    (type: CartProductType, id: string) => owned.has(`${type}:${id}`),
    [owned],
  )

  return { isOwned }
}
