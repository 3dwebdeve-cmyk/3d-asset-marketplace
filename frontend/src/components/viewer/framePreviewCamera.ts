import * as THREE from 'three'

// Look toward the front from the left, 45 degrees off the model's +Z axis.
export const PREVIEW_CAMERA_POSITION: [number, number, number] = [-1, 0.5, 1]

export function clampPreviewZoom(
  camera: THREE.PerspectiveCamera,
  bounds: THREE.Box3,
  target: THREE.Vector3,
): void {
  if (bounds.isEmpty() || !Number.isFinite(camera.aspect) || camera.aspect <= 0) return
  const direction = camera.position.clone().sub(target).normalize()
  if (direction.lengthSq() === 0) return
  const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize()
  const up = new THREE.Vector3().crossVectors(direction, right)
  const center = bounds.getCenter(new THREE.Vector3())
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2) * 0.9
  const halfWidth = halfHeight * camera.aspect
  const offset = new THREE.Vector3()
  let distance = 0

  // Fit about the model center, but check near-plane clearance from the actual orbit target.
  const panDepth = offset.copy(center).sub(target).dot(direction)
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        offset.set(x, y, z).sub(center)
        const depth = offset.dot(direction)
        distance = Math.max(
          distance,
          depth + panDepth + Math.abs(offset.dot(right)) / halfWidth,
          depth + panDepth + Math.abs(offset.dot(up)) / halfHeight,
          depth + panDepth + camera.near * 2,
        )
      }
    }
  }
  if (camera.position.distanceToSquared(target) < distance ** 2) {
    camera.position.copy(target).addScaledVector(direction, distance)
    camera.updateMatrixWorld()
  }
}

/** Bring the model closer while reserving horizontal room for viewer controls. */
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
  const viewportHalfHeight = Math.tan(verticalHalfFov)
  const verticalFill = THREE.MathUtils.lerp(0.82, 0.96, THREE.MathUtils.clamp(aspect - 1, 0, 1))
  const verticalLimit = viewportHalfHeight * verticalFill
  const horizontalLimit = viewportHalfHeight * aspect * 0.68
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
