import { CommerceCtaGroup } from '../../components/commerce/CommerceCtaGroup'

interface ProductCtaGroupProps {
  productId: string
  productName: string
  productSlug: string
  isFree?: boolean
}

export function ProductCtaGroup({
  productId,
  productName,
  productSlug,
  isFree = false,
}: ProductCtaGroupProps) {
  return (
    <CommerceCtaGroup
      productType="product"
      productId={productId}
      productName={productName}
      productSlug={productSlug}
      variant="buybox"
      showShare={false}
      useStandardGuestLabels
      isFree={isFree}
    />
  )
}
