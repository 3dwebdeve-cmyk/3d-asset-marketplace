export interface SoftwareFilter {
  id: string
  value: string
  label: string
  icon: string
  color: string
  // Text badge for software without an icon file in /images/software/.
  badge?: string
}

export const SOFTWARE_FILTERS: readonly SoftwareFilter[] = [
  { id: 'blender', value: 'blend', label: 'Blender (.blend)', icon: 'blender', color: '#ea7600' },
  { id: 'maya', value: 'ma,mb', label: 'Maya', icon: 'autodeskmaya', color: '#168b96' },
  { id: 'cinema4d', value: 'c4d', label: 'Cinema 4D', icon: 'cinema4d', color: '#344c9b' },
  { id: '3dsmax', value: 'max,3ds', label: '3ds Max', icon: 'autodesk3dsmax', color: '#1599ad', badge: '3' },
  { id: 'unreal', value: 'uasset,uproject', label: 'Unreal Engine', icon: 'unrealengine', color: '#171d2d' },
  { id: 'unity', value: 'unitypackage', label: 'Unity', icon: 'unity', color: '#252b36' },
]

// 3D model browse filters: the software above plus the exchange formats packages ship in.
// The values match the product's `formats` (package contents, lowercase, no dot).
export const MODEL_FORMAT_FILTERS: readonly SoftwareFilter[] = [
  ...SOFTWARE_FILTERS,
  { id: 'fbx', value: 'fbx', label: 'FBX (.fbx)', icon: 'fbx', color: '#4b5563', badge: 'FBX' },
  { id: 'obj', value: 'obj', label: 'OBJ (.obj)', icon: 'obj', color: '#64748b', badge: 'OBJ' },
  { id: 'gltf', value: 'glb,gltf', label: 'glTF / GLB', icon: 'gltf', color: '#5a8f29', badge: 'GL' },
]
