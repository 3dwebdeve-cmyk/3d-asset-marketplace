import {
  BoxGeometry,
  Color,
  Group,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  WireframeGeometry,
} from 'three'
import { describe, expect, it } from 'vitest'

import { applyWireframe, PREVIEW_WIREFRAME_OVERLAY } from './applyWireframe'

function overlayChildren(mesh: Mesh): LineSegments[] {
  return mesh.children.filter(
    (child): child is LineSegments =>
      child instanceof LineSegments && child.userData[PREVIEW_WIREFRAME_OVERLAY] === true,
  )
}

describe('applyWireframe', () => {
  it('applies gray clay shading and a black mesh overlay without mutating original materials', () => {
    const material = new MeshStandardMaterial({ color: 0xff0000 })
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), material)
    const nested = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshStandardMaterial({ color: 0x00ff00 }))
    mesh.add(nested)
    const root = new Group()
    root.add(mesh)

    applyWireframe(root, true)

    expect(material.wireframe).toBe(false)
    expect(mesh.material).toBeInstanceOf(MeshStandardMaterial)
    expect(mesh.material).not.toBe(material)
    expect((mesh.material as MeshStandardMaterial).color.getHex()).toBe(0xf6f6f6)
    expect(nested.material).toBe(mesh.material)

    const overlays = overlayChildren(mesh)
    expect(overlays).toHaveLength(1)
    expect(overlays[0].geometry).toBeInstanceOf(WireframeGeometry)
    expect(overlayChildren(nested)).toHaveLength(1)
    expect((overlays[0].material as { color: Color }).color.getHex()).toBe(0x111111)

    applyWireframe(root, false)

    expect(mesh.material).toBe(material)
    expect(overlayChildren(mesh)).toHaveLength(0)
    expect(overlayChildren(nested)).toHaveLength(0)
    expect(material.wireframe).toBe(false)
  })

  it('saves and restores a mesh material array', () => {
    const first = new MeshStandardMaterial({ color: 0x111111 })
    const second = new MeshStandardMaterial({ color: 0x222222 })
    const materials = [first, second]
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), materials)
    const root = new Group()
    root.add(mesh)

    applyWireframe(root, true)

    expect(first.wireframe).toBe(false)
    expect(second.wireframe).toBe(false)
    expect(mesh.material).not.toBe(materials)
    expect(overlayChildren(mesh)).toHaveLength(1)

    applyWireframe(root, false)

    expect(mesh.material).toBe(materials)
    expect(overlayChildren(mesh)).toHaveLength(0)
  })

  it('does not duplicate overlays when enabled twice', () => {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
    const root = new Group()
    root.add(mesh)

    applyWireframe(root, true)
    applyWireframe(root, true)

    expect(overlayChildren(mesh)).toHaveLength(1)
  })
})
