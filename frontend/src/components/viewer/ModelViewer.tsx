import { Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Environment, OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import * as THREE from 'three'

import { ErrorBoundary } from '../ErrorBoundary'
import { applyWireframe } from './applyWireframe'
import { DEFAULT_HDRI_ENVIRONMENT_ID, HDRI_ENVIRONMENTS } from './hdriEnvironments'
import { isSafePreviewModelUrl } from './isSafePreviewModelUrl'
import { isWebGLAvailable } from './isWebGLAvailable'
import { useAdaptivePixelRatio } from './useAdaptivePixelRatio'
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
  const { scene } = useThree()

  useEffect(() => {
    // Blur the visible HDRI backdrop only. This does NOT affect reflections (scene.environment).
    // NOTE: `backgroundBlurriness` is a three.js scene property (supported in modern versions).
    ;(scene as unknown as { backgroundBlurriness?: number }).backgroundBlurriness =
      showBackground && environmentFile ? backgroundBlur : 0

    return () => {
      ;(scene as unknown as { backgroundBlurriness?: number }).backgroundBlurriness = 0
    }
  }, [backgroundBlur, environmentFile, scene, showBackground])

  return (
    <>
      {/* Keep fill lights low so the key-light shadow stays readable. */}
      <ambientLight intensity={0.28 * lightMultiplier} />
      <hemisphereLight args={['#ffffff', '#a8b0bc', 0.34 * lightMultiplier]} />
      <directionalLight
        position={[5.2, 9.5, 4.2]}
        intensity={1.35 * lightMultiplier}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00015}
        shadow-normalBias={0.035}
        shadow-radius={3}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      >
        <object3D attach="target" position={[0, 0, 0]} />
      </directionalLight>
      <directionalLight
        position={[-3.5, 2.5, -4]}
        intensity={0.28 * lightMultiplier}
        castShadow={false}
      />
      <directionalLight
        position={[1.5, 3.5, 6]}
        intensity={0.2 * lightMultiplier}
        castShadow={false}
      />
      {environmentFile ? (
        // Own Suspense so HDRI load does not remount/tear down PreviewModel
        // (Canvas wraps all children in one Suspense boundary).
        <Suspense fallback={null}>
          <Environment
            files={environmentFile}
            background={showBackground}
            environmentIntensity={environmentIntensity}
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
    }
  }, [fitted])

  useEffect(() => {
    applyWireframe(fitted, wireframe)

    // Enable model shadows when the viewer enables shadows on the canvas.
    fitted.traverse((object) => {
      // Avoid relying on instanceof across module boundaries.
      if ((object as THREE.Mesh).isMesh) {
        const mesh = object as THREE.Mesh
        mesh.castShadow = true
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
        <>
          {/* Visual faded floor — transparent materials don't receive shadows well. */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, ground.y, 0]}>
            <planeGeometry args={[ground.width, ground.depth]} />
            <meshStandardMaterial
              color="#ffffff"
              roughness={0.98}
              metalness={0}
              transparent={Boolean(groundAlphaMap)}
              alphaMap={groundAlphaMap ?? undefined}
              depthWrite={false}
            />
          </mesh>
          {/* Dedicated shadow catcher aligned to the key light. */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, ground.y + 0.002, 0]}
            receiveShadow
          >
            <planeGeometry args={[ground.width, ground.depth]} />
            <shadowMaterial transparent opacity={0.42} />
          </mesh>
        </>
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
        camera={{ position: [0, 1.1, 3.2], fov: 42, near: 0.1, far: 200 }}
        shadows
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.18
          gl.shadowMap.enabled = true
          gl.shadowMap.type = THREE.PCFSoftShadowMap
        }}
        dpr={pixelRatio}
        frameloop={visible ? 'always' : 'never'}
      >
        {/* Fallback background when HDRI background isn't being shown (or HDRI isn't available). */}
        {!selectedEnvironment.background || !environmentFile ? (
          <color attach="background" args={['#f4f6fa']} />
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
