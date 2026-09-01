import { Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import * as THREE from 'three'

import { ErrorBoundary } from '../ErrorBoundary'
import { applyWireframe } from './applyWireframe'
import { disposeSceneResources } from './disposeSceneResources'
import { isSafePreviewModelUrl } from './isSafePreviewModelUrl'
import { isWebGLAvailable } from './isWebGLAvailable'
import { useAdaptivePixelRatio } from './useAdaptivePixelRatio'
import { useViewportVisibility } from './useViewportVisibility'

export interface ModelViewerProps {
  modelUrl: string
  ariaLabel: string
  className?: string
}

function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#f5f7fb', '#8a909c', 0.55]} />
      <directionalLight position={[4.5, 8, 3.5]} intensity={1.15} castShadow={false} />
      <directionalLight position={[-3.5, 2.5, -4]} intensity={0.35} castShadow={false} />
    </>
  )
}

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

function PreviewModel({ url, wireframe }: { url: string; wireframe: boolean }) {
  const { scene } = useGLTF(url)
  const fitted = useMemo(() => fitPreviewScene(scene), [scene])

  useEffect(() => {
    return () => {
      disposeSceneResources(fitted)
      useGLTF.clear(url)
    }
  }, [fitted, url])

  useEffect(() => {
    applyWireframe(fitted, wireframe)
    return () => {
      applyWireframe(fitted, false)
    }
  }, [fitted, wireframe])

  return <primitive object={fitted} />
}

function ViewerProgressOverlay() {
  const { active, progress, loaded, total } = useProgress()

  if (!active && loaded === total) {
    return null
  }

  const percent = Math.min(100, Math.round(progress))

  return (
    <div className="model-viewer__progress" role="status" aria-live="polite">
      <div className="model-viewer__progress-track">
        <div
          className="model-viewer__progress-bar"
          style={{ width: `${percent}%` }}
          aria-hidden="true"
        />
      </div>
      <p className="model-viewer__progress-label">Loading 3D preview… {percent}%</p>
    </div>
  )
}

function ModelViewerError({ message }: { message: string }) {
  return (
    <div className="model-viewer__error" role="alert">
      <p className="model-viewer__error-title">3D preview unavailable</p>
      <p className="model-viewer__error-body">{message}</p>
    </div>
  )
}

function ModelViewerCanvas({
  modelUrl,
  ariaLabel,
  visible,
  pixelRatio,
}: {
  modelUrl: string
  ariaLabel: string
  visible: boolean
  pixelRatio: number
}) {
  const [wireframe, setWireframe] = useState(false)

  return (
    <div className="model-viewer" role="img" aria-label={ariaLabel}>
      <Canvas
        className="model-viewer__canvas"
        camera={{ position: [0, 1.1, 3.2], fov: 42, near: 0.1, far: 200 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={pixelRatio}
        frameloop={visible ? 'always' : 'never'}
      >
        <color attach="background" args={['#eceff4']} />
        <StudioLights />
        <Suspense fallback={null}>
          <PreviewModel key={modelUrl} url={modelUrl} wireframe={wireframe} />
        </Suspense>
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={0.5}
          maxDistance={20}
          maxPolarAngle={Math.PI * 0.92}
        />
      </Canvas>
      <button
        type="button"
        className={`model-viewer__wireframe-btn${
          wireframe ? ' model-viewer__wireframe-btn--active' : ''
        }`}
        aria-pressed={wireframe}
        aria-label="Wireframe"
        onClick={() => setWireframe((current) => !current)}
      >
        Wireframe
      </button>
      <ViewerProgressOverlay />
    </div>
  )
}

export function ModelViewer({ modelUrl, ariaLabel, className }: ModelViewerProps) {
  const trimmedUrl = modelUrl.trim()
  const safe = isSafePreviewModelUrl(trimmedUrl)
  const pixelRatio = useAdaptivePixelRatio()
  const { ref, visible } = useViewportVisibility<HTMLDivElement>()
  const webglReady = isWebGLAvailable()

  if (!safe) {
    return (
      <div className={`model-viewer model-viewer--empty${className ? ` ${className}` : ''}`}>
        <ModelViewerError message="No valid preview model is available for this product." />
      </div>
    )
  }

  if (!webglReady) {
    return (
      <div className={`model-viewer model-viewer--empty${className ? ` ${className}` : ''}`}>
        <ModelViewerError message="WebGL is unavailable in this browser. Use image preview instead." />
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className={`model-viewer-shell${className ? ` ${className}` : ''}`}
      data-viewer-visible={visible ? 'true' : 'false'}
    >
      <ErrorBoundary
        fallback={
          <div className="model-viewer model-viewer--empty">
            <ModelViewerError message="The preview model could not be loaded. It may be missing or unsupported." />
          </div>
        }
      >
        <ModelViewerCanvas
          modelUrl={trimmedUrl}
          ariaLabel={ariaLabel}
          visible={visible}
          pixelRatio={pixelRatio}
        />
      </ErrorBoundary>
    </div>
  )
}

export default ModelViewer
