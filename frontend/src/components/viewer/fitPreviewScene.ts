import * as THREE from 'three'

/** Center + uniform-scale a GLB so it fills the fixed studio camera framing. */
export function fitPreviewScene(source: THREE.Object3D, targetSize = 1.8): THREE.Group {
  const root = new THREE.Group()
  const clone = source.clone(true)
  root.add(clone)

  const box = new THREE.Box3().setFromObject(clone)
  if (box.isEmpty()) {
    return root
  }

  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 1e-8)

  clone.position.x -= center.x
  clone.position.y -= center.y
  clone.position.z -= center.z
  root.scale.setScalar(targetSize / maxDim)

  return root
}
