import '../styles/software-filters.css'

export function SoftwareIcon({ icon, color }: { icon: string; color: string }) {
  if (icon === 'autodesk3dsmax') {
    return <span className="software-filter__badge" aria-hidden="true">3</span>
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
