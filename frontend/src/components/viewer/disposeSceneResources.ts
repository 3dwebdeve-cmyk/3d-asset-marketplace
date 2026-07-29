import type { Material, Object3D, Texture } from 'three'
import { Mesh, SkinnedMesh } from 'three'

function disposeTexture(value: unknown): void {
  if (
    value &&
    typeof value === 'object' &&
    'dispose' in value &&
    typeof (value as Texture).dispose === 'function'
  ) {
    ;(value as Texture).dispose()
  }
}

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material)) {
    disposeTexture(value)
  }
  material.dispose()
}

/**
 * Disposes GPU resources attached to meshes inside a cloned preview scene.
 * Safe to call multiple times; skips nodes without disposable resources.
 */
export function disposeSceneResources(root: Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof Mesh || child instanceof SkinnedMesh)) {
      return
    }

    child.geometry?.dispose()

    const materials: Material[] = Array.isArray(child.material)
      ? child.material
      : child.material
        ? [child.material]
        : []

    for (const material of materials) {
      disposeMaterial(material)
    }
  })
}
