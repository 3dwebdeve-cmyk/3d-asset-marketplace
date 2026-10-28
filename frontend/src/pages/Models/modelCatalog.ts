import { listPublicProducts } from '../../api/productsApi'
import type { PublicProduct, PublicProductListParams } from '../../types/product'

export type ModelCatalogItem = Omit<PublicProduct, 'formats'> & { formats: string[] }

export async function loadModelCatalog(
  params: PublicProductListParams,
): Promise<ModelCatalogItem[]> {
  const products: PublicProduct[] = []
  let page = 1
  while (true) {
    const response = await listPublicProducts({ ...params, page, page_size: 100 })
    products.push(...response.results)
    if (!response.next || response.results.length === 0) break
    page += 1
  }
  return [...new Map(products.map((product) => [
    product.id,
    { ...product, formats: product.formats ?? [] },
  ])).values()]
}
