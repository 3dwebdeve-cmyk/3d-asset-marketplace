import { Box3, BoxGeometry, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { fitPreviewScene } from './fitPreviewScene'
import { framePreviewCamera } from './framePreviewCamera'

describe('initial preview camera framing', () => {
  it.each([
    ['tall vase on desktop', [1, 12, 1], 2],
    ['wide furniture on desktop', [12, 1, 2], 2],
    ['deep model on desktop', [1, 2, 12], 2],
    ['tall vase on mobile', [1, 12, 1], 0.6],
    ['wide furniture on mobile', [12, 1, 2], 0.6],
    ['cube on mobile', [4, 4, 4], 0.6],
  ] as const)('keeps the entire %s visible with generous space', (_name, dimensions, aspect) => {
    const source = new Mesh(new BoxGeometry(...dimensions), new MeshBasicMaterial())
    source.position.set(120, -30, 500)
    const model = fitPreviewScene(source)
    const camera = new PerspectiveCamera(42, aspect, 0.1, 200)
    camera.zoom = 3
    const center = framePreviewCamera(camera, model, aspect)!
    expect(center.length()).toBeCloseTo(0)
    expect(camera.zoom).toBe(1)
    const bounds = new Box3().setFromObject(model)
    let occupied = 0
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const point = new Vector3(x, y, z).project(camera)
          occupied = Math.max(occupied, Math.abs(point.x), Math.abs(point.y))
          expect(Math.abs(point.x)).toBeLessThanOrEqual(0.61)
          expect(Math.abs(point.y)).toBeLessThanOrEqual(0.61)
          expect(point.z).toBeGreaterThan(-1)
          expect(point.z).toBeLessThan(1)
        }
      }
    }
    expect(occupied).toBeGreaterThan(0.3)
    expect(source.position.toArray()).toEqual([120, -30, 500])
    source.geometry.dispose()
    source.material.dispose()
  })

  it('moves farther back for a narrower viewport', () => {
    const model = fitPreviewScene(new Mesh(new BoxGeometry(4, 1, 2)))
    const camera = new PerspectiveCamera(42)
    framePreviewCamera(camera, model, 2)
    const desktopDistance = camera.position.length()
    framePreviewCamera(camera, model, 0.6)
    expect(camera.position.length()).toBeGreaterThan(desktopDistance)
  })

  it('leaves the camera alone for empty models and zero-size viewports', () => {
    const camera = new PerspectiveCamera(42)
    camera.position.set(0, 1, 3)
    expect(framePreviewCamera(camera, new Object3D(), 2)).toBeNull()
    expect(framePreviewCamera(camera, new Mesh(new BoxGeometry()), 0)).toBeNull()
    expect(camera.position.toArray()).toEqual([0, 1, 3])
  })
})
