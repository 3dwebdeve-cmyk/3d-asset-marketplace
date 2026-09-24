import { CommerceCtaGroup } from '../../components/commerce/CommerceCtaGroup'

interface ProductCtaGroupProps {
  productId: string
  productName: string
  productSlug: string
}

export function ProductCtaGroup({ productId, productName, productSlug }: ProductCtaGroupProps) {
  return (
    <CommerceCtaGroup
      productType="product"
      productId={productId}
      productName={productName}
      productSlug={productSlug}
      variant="buybox"
    />
  )
}
