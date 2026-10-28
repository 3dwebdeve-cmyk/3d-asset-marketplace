import '../styles/software-filters.css'

export function SoftwareIcon({ icon, color, badge }: { icon: string; color: string; badge?: string }) {
  if (badge) {
    const isWide = badge.length > 1
    return (
      <span
        className={`software-filter__badge${isWide ? ' software-filter__badge--text' : ''}`}
        style={isWide ? { background: color } : undefined}
        aria-hidden="true"
      >
        {badge}
      </span>
    )
  }
  const source = `url("/images/software/${icon}.svg")`
  return (
    <span
      className="software-filter__icon"
      aria-hidden="true"
      style={{ maskImage: source, WebkitMaskImage: source, backgroundColor: color }}
    />
  )
}
