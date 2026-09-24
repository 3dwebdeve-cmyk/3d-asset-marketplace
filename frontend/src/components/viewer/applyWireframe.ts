import {
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  WireframeGeometry,
  type Material,
  type Object3D,
} from 'three'

export const PREVIEW_WIREFRAME_OVERLAY = 'previewWireframeOverlay'

const ORIGINAL_MATERIAL_KEY = 'previewWireframeOriginalMaterial'
const CLAY_MATERIAL_KEY = 'previewWireframeClayMaterial'
const LINE_MATERIAL_KEY = 'previewWireframeLineMaterial'

function isPreviewMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true && object.userData[PREVIEW_WIREFRAME_OVERLAY] !== true
}

function collectMeshes(root: Object3D): Mesh[] {
  const meshes: Mesh[] = []
  root.traverse((child) => {
    if (isPreviewMesh(child) && child.geometry != null) {
      meshes.push(child)
    }
  })
  return meshes
}

function collectOverlays(root: Object3D): LineSegments[] {
  const overlays: LineSegments[] = []
  root.traverse((child) => {
    if (child.userData[PREVIEW_WIREFRAME_OVERLAY] === true && child instanceof LineSegments) {
      overlays.push(child)
    }
  })
  return overlays
}

function restoreOriginalMaterials(root: Object3D): void {
  for (const mesh of collectMeshes(root)) {
    const original = mesh.userData[ORIGINAL_MATERIAL_KEY] as Material | Material[] | undefined
    if (original !== undefined) {
      mesh.material = original
      delete mesh.userData[ORIGINAL_MATERIAL_KEY]
    }
  }
}

function disposeOwnedMaterials(root: Object3D): void {
  const clay = root.userData[CLAY_MATERIAL_KEY] as MeshStandardMaterial | undefined
  const line = root.userData[LINE_MATERIAL_KEY] as LineBasicMaterial | undefined
  clay?.dispose()
  line?.dispose()
  delete root.userData[CLAY_MATERIAL_KEY]
  delete root.userData[LINE_MATERIAL_KEY]
}

function clearWireframe(root: Object3D): void {
  for (const overlay of collectOverlays(root)) {
    overlay.parent?.remove(overlay)
    overlay.geometry.dispose()
  }
  restoreOriginalMaterials(root)
  disposeOwnedMaterials(root)
}

function createClayMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: 0xf6f6f6,
    roughness: 0.85,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
}

function createLineMaterial(): LineBasicMaterial {
  return new LineBasicMaterial({
    color: 0x111111,
    depthTest: true,
    depthWrite: false,
  })
}

/** Show a gray clay mesh with black polygon edges overlaid, or restore the original look. */
export function applyWireframe(root: Object3D, enabled: boolean): void {
  clearWireframe(root)
  if (!enabled) {
    return
  }

  const clay = createClayMaterial()
  const lineMaterial = createLineMaterial()
  root.userData[CLAY_MATERIAL_KEY] = clay
  root.userData[LINE_MATERIAL_KEY] = lineMaterial

  for (const mesh of collectMeshes(root)) {
    mesh.userData[ORIGINAL_MATERIAL_KEY] = mesh.material
    mesh.material = clay

    const overlay = new LineSegments(new WireframeGeometry(mesh.geometry), lineMaterial)
    overlay.userData[PREVIEW_WIREFRAME_OVERLAY] = true
    overlay.renderOrder = mesh.renderOrder + 1
    overlay.frustumCulled = false
    mesh.add(overlay)
  }
}
