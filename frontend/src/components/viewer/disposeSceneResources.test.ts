import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { disposeSceneResources } from './disposeSceneResources'

describe('disposeSceneResources', () => {
  it('disposes mesh geometry, materials, and attached textures', () => {
    const geometry = new BoxGeometry()
    const material = new MeshBasicMaterial()
    const mesh = new Mesh(geometry, material)
    const root = new Object3D()
    root.add(mesh)

    const geometryDispose = vi.spyOn(geometry, 'dispose')
    const materialDispose = vi.spyOn(material, 'dispose')

    disposeSceneResources(root)

    expect(geometryDispose).toHaveBeenCalledTimes(1)
    expect(materialDispose).toHaveBeenCalledTimes(1)
  })

  it('handles multi-material meshes without throwing', () => {
    const geometry = new BoxGeometry()
    const materials = [new MeshBasicMaterial(), new MeshBasicMaterial()]
    const mesh = new Mesh(geometry, materials)
    const root = new Object3D()
    root.add(mesh)

    const geometryDispose = vi.spyOn(geometry, 'dispose')
    const materialDisposes = materials.map((material) => vi.spyOn(material, 'dispose'))

    expect(() => disposeSceneResources(root)).not.toThrow()
    expect(geometryDispose).toHaveBeenCalledTimes(1)
    for (const spy of materialDisposes) {
      expect(spy).toHaveBeenCalledTimes(1)
    }
  })
})
