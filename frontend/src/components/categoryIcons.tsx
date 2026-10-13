import type { ReactElement } from 'react'

type IconProps = { className?: string }
export type CategoryIconComponent = (props: IconProps) => ReactElement

function icon(
  paths: ReactElement | ReactElement[],
): CategoryIconComponent {
  return ({ className }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {paths}
    </svg>
  )
}

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const AllCategoriesIcon = icon(
  <>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" {...stroke} />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" {...stroke} />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" {...stroke} />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" {...stroke} />
  </>,
)

const FurnitureIcon = icon(
  <path d="M5 13h14v3H5v-3ZM7 16v3M17 16v3M6 13V9a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4" {...stroke} />,
)

const ProductsIcon = icon(
  <path d="M4.5 8.5 12 4l7.5 4.5v7L12 20l-7.5-4.5v-7Z M12 12v8M4.5 8.5 12 12l7.5-3.5" {...stroke} />,
)

const ToysIcon = icon(
  <path d="M8 10a4 4 0 1 1 8 0v2H8v-2ZM7 12h10l1.5 7h-13L7 12Zm3 0v7m4-7v7" {...stroke} />,
)

const ElectronicsIcon = icon(
  <>
    <rect x="5" y="4" width="14" height="12" rx="1.5" {...stroke} />
    <path d="M9 20h6M12 16v4" {...stroke} />
  </>,
)

const FoodDrinkIcon = icon(
  <path d="M7 4v7a5 5 0 0 0 10 0V4M9 4v4m3-4v4m3-4v4M8 20h8" {...stroke} />,
)

const CharacterIcon = icon(
  <>
    <circle cx="12" cy="8" r="3.2" {...stroke} />
    <path d="M5.5 19.5c1.2-3.2 3.5-4.8 6.5-4.8s5.3 1.6 6.5 4.8" {...stroke} />
  </>,
)

const IndustrialIcon = icon(
  <path d="M4 20V10l5 3V8l5 3V5l6 4v11H4Z" {...stroke} />,
)

const HouseholdIcon = icon(
  <path d="M4 11.5 12 4l8 7.5M7 10.5V20h10v-9.5" {...stroke} />,
)

const PlantsIcon = icon(
  <path d="M12 21V11M12 11c-4-1-6-4-6-7 4 0 6 3 6 7Zm0 0c4-1 6-4 6-7-4 0-6 3-6 7Z" {...stroke} />,
)

const LightsIcon = icon(
  <path d="M9 18h6M10 21h4M12 3a5 5 0 0 0-3 9c.4.5.8 1.3.9 2h4.2c.1-.7.5-1.5.9-2a5 5 0 0 0-3-9Z" {...stroke} />,
)

const PrintingIcon = icon(
  <>
    <path d="M7 9V4h10v5M7 15h10v5H7v-5Z" {...stroke} />
    <rect x="4" y="9" width="16" height="6" rx="1.2" {...stroke} />
  </>,
)

const AssetsIcon = icon(
  <path d="M4 8.5 12 4l8 4.5-8 4.5L4 8.5Zm0 3.5 8 4.5 8-4.5M4 15.5 12 20l8-4.5" {...stroke} />,
)

const LifestyleIcon = icon(
  <path d="M4 19V9l8-5 8 5v10H4Zm5-5h6" {...stroke} />,
)

const ClothIcon = icon(
  <path d="M9 4h6l2 4 3 1v3l-3-.5V20H7v-8.5L4 12V9l3-1 2-4Z" {...stroke} />,
)

const InteractiveIcon = icon(
  <>
    <rect x="4" y="5" width="16" height="12" rx="2" {...stroke} />
    <path d="M9 21h6M12 17v4M10 10.5l2 2 3-3.5" {...stroke} />
  </>,
)

const ArchitectureIcon = icon(
  <path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6" {...stroke} />,
)

const InteriorIcon = icon(
  <path d="M3.5 20V8.5L12 3l8.5 5.5V20M8 20v-5h8v5M12 3v17" {...stroke} />,
)

const VehiclesIcon = icon(
  <path
    d="M4 15.5V13l1.8-5.2A2 2 0 0 1 7.7 6.5h8.6a2 2 0 0 1 1.9 1.3L20 13v2.5M4 15.5h16M6.5 17.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
    {...stroke}
  />,
)

const DefaultCategoryIcon = icon(
  <path d="M5 7.5h14M5 12h14M5 16.5h10" {...stroke} />,
)

const CATEGORY_ICONS: Record<string, CategoryIconComponent> = {
  furniture: FurnitureIcon,
  products: ProductsIcon,
  toys: ToysIcon,
  electronics: ElectronicsIcon,
  'food-drink': FoodDrinkIcon,
  character: CharacterIcon,
  industrial: IndustrialIcon,
  household: HouseholdIcon,
  'plants-vegetation': PlantsIcon,
  lights: LightsIcon,
  '3d-printing': PrintingIcon,
  'assets-props': AssetsIcon,
  'lifestyle-visualisation': LifestyleIcon,
  'cloth-items': ClothIcon,
  'interactive-webar': InteractiveIcon,
  'architectural-3d-models': ArchitectureIcon,
  'interior-3d-models': InteriorIcon,
  vehicles: VehiclesIcon,
  architecture: ArchitectureIcon,
}

export function getCategoryIcon(slug: string): CategoryIconComponent {
  const normalized = slug.trim().toLowerCase()
  if (CATEGORY_ICONS[normalized]) return CATEGORY_ICONS[normalized]
  const match = Object.keys(CATEGORY_ICONS).find((key) => normalized.includes(key))
  return match ? CATEGORY_ICONS[match] : DefaultCategoryIcon
}

export function getAllCategoriesIcon(): CategoryIconComponent {
  return AllCategoriesIcon
}
