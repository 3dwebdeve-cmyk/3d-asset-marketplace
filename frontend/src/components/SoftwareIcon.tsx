import '../styles/software-filters.css'

export const SOFTWARE_FILTERS = [
  { id: 'blender', value: 'blend', label: 'Blender (.blend)', icon: 'blender', color: '#ea7600' },
  { id: 'maya', value: 'ma,mb', label: 'Maya', icon: 'autodeskmaya', color: '#168b96' },
  { id: 'cinema4d', value: 'c4d', label: 'Cinema 4D', icon: 'cinema4d', color: '#344c9b' },
  { id: '3dsmax', value: 'max,3ds', label: '3ds Max', icon: 'autodesk3dsmax', color: '#1599ad' },
  { id: 'unreal', value: 'uasset,uproject', label: 'Unreal Engine', icon: 'unrealengine', color: '#171d2d' },
  { id: 'unity', value: 'unitypackage', label: 'Unity', icon: 'unity', color: '#252b36' },
] as const

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
