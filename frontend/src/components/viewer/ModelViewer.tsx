import { Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import * as THREE from 'three'

import { ErrorBoundary } from '../ErrorBoundary'
import { applyWireframe } from './applyWireframe'
import { DEFAULT_HDRI_ENVIRONMENT_ID, HDRI_ENVIRONMENTS } from './hdriEnvironments'
import { isSafePreviewModelUrl } from './isSafePreviewModelUrl'
import { isWebGLAvailable } from './isWebGLAvailable'
import { useAdaptivePixelRatio, useAdaptiveShadowMapSize } from './useAdaptivePixelRatio'
import { useViewportVisibility } from './useViewportVisibility'

export interface ModelViewerProps {
  modelUrl: string
  ariaLabel: string
  className?: string
}

function SceneLights({
  environmentFile,
  environmentIntensity,
  lightMultiplier,
  showBackground,
  backgroundBlur,
}: {
  environmentFile: string | null
  environmentIntensity: number
  lightMultiplier: number
  showBackground: boolean
  backgroundBlur: number
}) {
  return (
    <>
      {/* Brighter fill + key for a clearer studio read. Soft contact shadow is separate. */}
      <ambientLight intensity={0.42 * lightMultiplier} />
      <hemisphereLight args={['#ffffff', '#c4cad3', 0.48 * lightMultiplier]} />
      <directionalLight position={[5.2, 9.5, 4.2]} intensity={1.65 * lightMultiplier} />
      <directionalLight position={[-3.5, 2.5, -4]} intensity={0.45 * lightMultiplier} />
      <directionalLight position={[1.5, 3.5, 6]} intensity={0.35 * lightMultiplier} />
      {environmentFile ? (
        // Own Suspense so HDRI load does not remount/tear down PreviewModel
        // (Canvas wraps all children in one Suspense boundary).
        <Suspense fallback={null}>
          {/* Blur must be passed to drei Environment — it applies background in useLayoutEffect;
              a separate useEffect often runs before the HDRI texture exists and gets reset to 0. */}
          <Environment
            files={environmentFile}
            background={showBackground}
            environmentIntensity={environmentIntensity}
            backgroundBlurriness={showBackground ? backgroundBlur : 0}
          />
        </Suspense>
      ) : null}
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

function PreviewModel({
  url,
  wireframe,
  showGround,
}: {
  url: string
  wireframe: boolean
  showGround: boolean
}) {
  const { scene } = useGLTF(url)
  const shadowMapSize = useAdaptiveShadowMapSize()
  // clone(true) shares geometries/materials with the useGLTF cache — never dispose them here.
  const fitted = useMemo(() => fitPreviewScene(scene), [scene])
  const groundAlphaMap = useMemo(() => {
    if (typeof document === 'undefined') {
      return null
    }

    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return null
    }

    // Soft radial fade: keep it opaque for most of the plane,
    // then fade only at the very edges (so the floor feels "infinite").
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.82, 'rgba(255,255,255,1)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)

    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.needsUpdate = true
    return texture
  }, [])

  useEffect(() => {
    return () => {
      groundAlphaMap?.dispose()
    }
  }, [groundAlphaMap])

  const ground = useMemo(() => {
    const box = new THREE.Box3().setFromObject(fitted)
    if (box.isEmpty()) {
      return null
    }
    const size = box.getSize(new THREE.Vector3())
    const maxXZ = Math.max(size.x, size.z, 0.01)
    return {
      y: box.min.y - 0.02,
      // Make the floor so large that its edge is never visible at our orbit distances,
      // which makes it feel effectively "infinite".
      width: Math.max(maxXZ * 7.5, 320),
      depth: Math.max(maxXZ * 7.5, 320),
      // Wide enough for the model silhouette plus a soft outer fade.
      shadowScale: Math.max(maxXZ * 4.2, 4.5),
    }
  }, [fitted])

  useEffect(() => {
    applyWireframe(fitted, wireframe)

    fitted.traverse((object) => {
      // Avoid relying on instanceof across module boundaries.
      if ((object as THREE.Mesh).isMesh) {
        const mesh = object as THREE.Mesh
        // ContactShadows samples mesh depth to inherit the model silhouette.
        mesh.castShadow = false
        mesh.receiveShadow = false
      }
    })

    return () => {
      applyWireframe(fitted, false)
    }
  }, [fitted, wireframe])

  return (
    <>
      {showGround && ground ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, ground.y, 0]}>
          <planeGeometry args={[ground.width, ground.depth]} />
          {/* Basic white — stays pure white (not lit gray) and matches the solid backdrop. */}
          <meshBasicMaterial
            color="#ffffff"
            transparent={Boolean(groundAlphaMap)}
            alphaMap={groundAlphaMap ?? undefined}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ) : null}
      {ground ? (
        <ContactShadows
          key={url}
          position={[0, ground.y + 0.001, 0]}
          opacity={0.88}
          scale={ground.shadowScale}
          blur={2.35}
          far={5}
          resolution={shadowMapSize}
          frames={1}
          color="#000000"
        />
      ) : null}
      <primitive object={fitted} />
    </>
  )
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
  const [environmentId, setEnvironmentId] = useState(DEFAULT_HDRI_ENVIRONMENT_ID)
  const [environmentFile, setEnvironmentFile] = useState<string | null>(null)
  const [environmentError, setEnvironmentError] = useState<string | null>(null)
  const selectedEnvironment = useMemo(
    () =>
      HDRI_ENVIRONMENTS.find((option) => option.id === environmentId) ?? HDRI_ENVIRONMENTS[0],
    [environmentId],
  )

  useEffect(() => {
    const controller = new AbortController()
    const hdrPath = selectedEnvironment.hdrPath
    setEnvironmentError(null)
    // Keep the previous HDR mounted until the next path is confirmed so
    // Environment does not remount through a null gap and suspend the canvas.
    if (typeof fetch !== 'function') {
      setEnvironmentFile(hdrPath)
      return () => controller.abort()
    }

    fetch(hdrPath, { method: 'HEAD', signal: controller.signal })
      .then((response) => {
        if (response.ok) {
          setEnvironmentFile(hdrPath)
          return
        }
        setEnvironmentFile(null)
        setEnvironmentError(
          `${selectedEnvironment.label} HDRI is unavailable. Using default preview lighting.`,
        )
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setEnvironmentFile(null)
          setEnvironmentError(
            `${selectedEnvironment.label} HDRI failed to load. Using default preview lighting.`,
          )
        }
      })

    return () => controller.abort()
  }, [selectedEnvironment.hdrPath, selectedEnvironment.label])

  return (
    <div className="model-viewer" role="img" aria-label={ariaLabel}>
      <Canvas
        className="model-viewer__canvas"
        camera={{ position: [0, 0.9, 2.3], fov: 42, near: 0.1, far: 200 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.18
        }}
        dpr={pixelRatio}
        frameloop={visible ? 'always' : 'never'}
      >
        {/* Fallback / studio solid backdrop — pure white so the floor never reads gray. */}
        {!selectedEnvironment.background || !environmentFile ? (
          <color attach="background" args={['#ffffff']} />
        ) : null}
        <SceneLights
          environmentFile={environmentFile}
          environmentIntensity={selectedEnvironment.environmentIntensity}
          lightMultiplier={selectedEnvironment.lightMultiplier}
          showBackground={selectedEnvironment.background}
          backgroundBlur={selectedEnvironment.backgroundBlur}
        />
        <Suspense fallback={null}>
          <PreviewModel
            key={modelUrl}
            url={modelUrl}
            wireframe={wireframe}
            showGround={selectedEnvironment.showGround}
          />
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
      <div className="model-viewer__controls" role="group" aria-label="Viewer controls">
        <div className="model-viewer__environment" role="radiogroup" aria-label="Lighting setup">
          {HDRI_ENVIRONMENTS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`model-viewer__chip${
                environmentId === option.id ? ' model-viewer__chip--active' : ''
              }`}
              role="radio"
              aria-checked={environmentId === option.id}
              onClick={() => setEnvironmentId(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
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
      </div>
      {environmentError ? (
        <p className="model-viewer__hint" role="status" aria-live="polite">
          {environmentError}
        </p>
      ) : null}
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
