import { CommerceCtaGroup } from '../../components/commerce/CommerceCtaGroup'

interface PluginCtaGroupProps {
  pluginId: string
  pluginName: string
  pluginSlug: string
}

export function PluginCtaGroup({ pluginId, pluginName, pluginSlug }: PluginCtaGroupProps) {
  return (
    <CommerceCtaGroup
      productType="plugin"
      productId={pluginId}
      productName={pluginName}
      productSlug={pluginSlug}
      variant="stacked"
      showWishlist
      showCheckoutNote
    />
  )
}
