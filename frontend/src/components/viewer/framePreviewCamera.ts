import * as THREE from 'three'

// Elevated three-quarter view from the opposite side of the old rear-facing view.
export const PREVIEW_CAMERA_POSITION: [number, number, number] = [1.8, 1.2, -2.3]

/** Fit the model inside 55% of the viewport, leaving room for its shadow and controls. */
export function framePreviewCamera(
  camera: THREE.PerspectiveCamera,
  model: THREE.Object3D,
  aspect: number,
): THREE.Vector3 | null {
  const box = new THREE.Box3().setFromObject(model)
  if (box.isEmpty() || !Number.isFinite(aspect) || aspect <= 0) return null

  const sphere = box.getBoundingSphere(new THREE.Sphere())
  if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) return null

  camera.aspect = aspect
  camera.zoom = 1
  const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov) / 2
  const direction = new THREE.Vector3(...PREVIEW_CAMERA_POSITION).normalize()
  const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize()
  const up = new THREE.Vector3().crossVectors(direction, right)
  const verticalLimit = Math.tan(verticalHalfFov) * 0.55
  const horizontalLimit = verticalLimit * aspect
  const offset = new THREE.Vector3()
  let distance = sphere.radius * 1.01

  // Fit all eight corners in camera space, including their perspective depth.
  // Wide models can use the available width instead of being shrunk to fit a sphere.
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        offset.set(x, y, z).sub(sphere.center)
        const depth = offset.dot(direction)
        distance = Math.max(
          distance,
          depth + Math.abs(offset.dot(right)) / horizontalLimit,
          depth + Math.abs(offset.dot(up)) / verticalLimit,
        )
      }
    }
  }

  camera.position.copy(sphere.center).addScaledVector(direction, distance)
  camera.near = Math.max(sphere.radius / 100, 0.001)
  camera.far = Math.max(200, distance + sphere.radius * 4)
  camera.lookAt(sphere.center)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  return sphere.center
}
