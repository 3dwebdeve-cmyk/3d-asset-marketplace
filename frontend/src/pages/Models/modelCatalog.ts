import type { QueryClient } from '@tanstack/react-query'
import { getPublicProduct, listPublicProducts } from '../../api/productsApi'
import type { PublicProduct, PublicProductListParams } from '../../types/product'

export type ModelCatalogItem = PublicProduct & { formats: string[] }

// The existing API exposes file formats on detail responses only.
// Cache those reads and limit concurrency while loading all result pages.
export async function loadModelCatalog(
  params: PublicProductListParams,
  queryClient: QueryClient,
): Promise<ModelCatalogItem[]> {
  const products: PublicProduct[] = []
  let page = 1
  while (true) {
    const response = await listPublicProducts({ ...params, page, page_size: 100 })
    products.push(...response.results)
    if (!response.next || response.results.length === 0) break
    page += 1
  }
  const uniqueProducts = [...new Map(products.map((product) => [product.id, product])).values()]
  const result: ModelCatalogItem[] = new Array(uniqueProducts.length)
  let index = 0
  await Promise.all(Array.from({ length: Math.min(4, uniqueProducts.length) }, async () => {
    while (index < uniqueProducts.length) {
      const position = index++
      const product = uniqueProducts[position]
      const detail = await queryClient.fetchQuery({
        queryKey: ['model-filter-detail', product.slug],
        queryFn: () => getPublicProduct(product.slug),
        staleTime: 5 * 60 * 1000,
      })
      result[position] = { ...product, formats: detail.files.map((file) => file.file_format.toLowerCase()) }
    }
  }))
  return result
}
