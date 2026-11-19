import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import * as THREE from 'three'

import { ErrorBoundary } from '../ErrorBoundary'
import { applyWireframe } from './applyWireframe'
import { fitPreviewScene } from './fitPreviewScene'
import { framePreviewCamera, PREVIEW_CAMERA_POSITION } from './framePreviewCamera'
import { DEFAULT_HDRI_ENVIRONMENT_ID, HDRI_ENVIRONMENTS, type HdriEnvironmentId } from './hdriEnvironments'
import { isSafePreviewModelUrl } from './isSafePreviewModelUrl'
import { isWebGLAvailable } from './isWebGLAvailable'
import { useAdaptivePixelRatio, useAdaptiveShadowMapSize } from './useAdaptivePixelRatio'
import { useViewportVisibility } from './useViewportVisibility'

export interface ModelViewerProps {
  modelUrl: string
  ariaLabel: string
  className?: string
}

const ENTRANCE_DURATION = 1.5
const ENTRANCE_START_SCALE = 0.6

function SceneBackground({ showEnvironment }: { showEnvironment: boolean }) {
  const scene = useThree((state) => state.scene)

  useLayoutEffect(() => {
    if (showEnvironment) {
      return
    }

    // Clear any HDRI restored by Drei so the canvas gradient shows through.
    scene.background = null
    scene.backgroundBlurriness = 0
  }, [scene, showEnvironment])

  return null
}

function SceneLights({
  environmentId,
  environmentFile,
  environmentIntensity,
  lightMultiplier,
  showBackground,
  backgroundBlur,
}: {
  environmentId: HdriEnvironmentId
  environmentFile: string | null
  environmentIntensity: number
  lightMultiplier: number
  showBackground: boolean
  backgroundBlur: number
}) {
  const naturalFallback = (
    <>
      <ambientLight intensity={0.18} />
      <hemisphereLight args={['#ffffff', '#c4cad3', 0.3]} />
    </>
  )
  return (
    <>
      {environmentId === 'studio' ? (
        <>
          {/* Space three equal lights around the model for consistent coverage while orbiting. */}
          <ambientLight intensity={0.1 * lightMultiplier} />
          <hemisphereLight args={['#ffffff', '#ffffff', 0.2 * lightMultiplier]} />
          <directionalLight position={[0, 4, 5]} intensity={0.85 * lightMultiplier} />
          <directionalLight position={[-4.33, 4, -2.5]} intensity={0.85 * lightMultiplier} />
          <directionalLight position={[4.33, 4, -2.5]} intensity={0.85 * lightMultiplier} />
        </>
      ) : !environmentFile ? naturalFallback : null}
      {environmentFile ? (
        // Own Suspense so HDRI load does not remount/tear down PreviewModel
        // (Canvas wraps all children in one Suspense boundary).
        <Suspense
          key={environmentFile}
          fallback={environmentId === 'natural' ? naturalFallback : null}
        >
          {/* Blur must be passed to drei Environment — it applies background in useLayoutEffect;
              a separate useEffect often runs before the HDRI texture exists and gets reset to 0. */}
          <Environment
            files={environmentFile}
            background={showBackground}
            environmentIntensity={environmentIntensity}
            environmentRotation={environmentId === 'studio' ? [0, Math.PI / 4, 0] : [0, 0, 0]}
            backgroundBlurriness={showBackground ? backgroundBlur : 0}
          />
        </Suspense>
      ) : null}
    </>
  )
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
  const modelGroup = useRef<THREE.Group>(null)
  const [entranceComplete, setEntranceComplete] = useState(false)
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false),
    [],
  )
  const entranceTime = useRef(0)
  useFrame((_, delta) => {
    if (reducedMotion || entranceTime.current >= ENTRANCE_DURATION || !modelGroup.current) return
    entranceTime.current = Math.min(entranceTime.current + Math.min(delta, 0.05), ENTRANCE_DURATION)
    const progress = entranceTime.current / ENTRANCE_DURATION
    const eased = 1 - (1 - progress) ** 3
    modelGroup.current.scale.setScalar(ENTRANCE_START_SCALE + (1 - ENTRANCE_START_SCALE) * eased)
    if (progress === 1) setEntranceComplete(true)
  })
  const shadowMapSize = useAdaptiveShadowMapSize()
  // clone(true) shares geometries/materials with the useGLTF cache — never dispose them here.
  const fitted = useMemo(() => fitPreviewScene(scene), [scene])
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const controls = useThree((state) => state.controls)
  const invalidate = useThree((state) => state.invalidate)

  useLayoutEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || size.width <= 0 || size.height <= 0) return
    const center = framePreviewCamera(camera, fitted, size.width / size.height)
    if (!center) return
    const orbit = controls as {
      target?: THREE.Vector3
      update?: () => void
      saveState?: () => void
    } | null
    orbit?.target?.copy(center)
    orbit?.update?.()
    orbit?.saveState?.()
    invalidate()
  }, [camera, controls, fitted, size.width, size.height, invalidate])

  const ground = useMemo(() => {
    const box = new THREE.Box3().setFromObject(fitted)
    if (box.isEmpty()) {
      return null
    }
    const size = box.getSize(new THREE.Vector3())
    const maxXZ = Math.max(size.x, size.z, 0.01)
    return {
      y: box.min.y - 0.02,
      // Wide spread ambient shadow pool with smooth gradient falloff
      shadowScaleSpread: Math.max(maxXZ * 5.25, 5.5),
      // Soft mid body shadow for natural grounding
      shadowScaleMid: Math.max(maxXZ * 3.5, 3.75),
      // Gentle contact core under the model base
      shadowScaleCore: Math.max(maxXZ * 1.7, 1.9),
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
        <>
          {/* Diffused wide spread shadow pool — broad scale and high blur for smooth, non-sharp dissipation */}
          <ContactShadows
            key={`${url}-spread-${entranceComplete}`}
            position={[0, ground.y + 0.001, 0]}
            opacity={0.26}
            scale={ground.shadowScaleSpread}
            blur={5}
            far={4.0}
            resolution={shadowMapSize}
            frames={1}
            color="#1e1e24"
          />
          {/* Soft mid body shadow — smooth falloff adding depth without sharp contours */}
          <ContactShadows
            key={`${url}-mid-${entranceComplete}`}
            position={[0, ground.y + 0.002, 0]}
            opacity={0.28}
            scale={ground.shadowScaleMid}
            blur={3.5}
            far={2.8}
            resolution={shadowMapSize}
            frames={1}
            color="#141418"
          />
          {/* Grounding core shadow — softly anchors the model to the floor */}
          <ContactShadows
            key={`${url}-core-${entranceComplete}`}
            position={[0, ground.y + 0.003, 0]}
            opacity={0.32}
            scale={ground.shadowScaleCore}
            blur={1.6}
            far={1.8}
            resolution={shadowMapSize}
            frames={1}
            color="#0c0c0e"
          />
        </>
      ) : null}
      <group ref={modelGroup} scale={reducedMotion ? 1 : ENTRANCE_START_SCALE}>
        <primitive object={fitted} />
      </group>
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
  const [environmentId, setEnvironmentId] = useState(DEFAULT_HDRI_ENVIRONMENT_ID)
  const [environmentStatus, setEnvironmentStatus] = useState<{
    path: string
    available: boolean
    error: string | null
  } | null>(null)
  const selectedEnvironment = useMemo(
    () =>
      HDRI_ENVIRONMENTS.find((option) => option.id === environmentId) ?? HDRI_ENVIRONMENTS[0],
    [environmentId],
  )
  // Never pair an old HDRI with the newly selected preset's settings.
  const currentStatus = environmentStatus?.path === selectedEnvironment.hdrPath
    ? environmentStatus
    : null
  const environmentFile = currentStatus?.available ? currentStatus.path : null
  const environmentError = currentStatus?.error ?? null

  useEffect(() => {
    const controller = new AbortController()
    const hdrPath = selectedEnvironment.hdrPath
    if (typeof fetch !== 'function') {
      setEnvironmentStatus({ path: hdrPath, available: true, error: null })
      return () => controller.abort()
    }

    fetch(hdrPath, { method: 'HEAD', signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return
        if (response.ok) {
          setEnvironmentStatus({ path: hdrPath, available: true, error: null })
          return
        }
        setEnvironmentStatus({
          path: hdrPath,
          available: false,
          error: `${selectedEnvironment.label} HDRI is unavailable. Using default preview lighting.`,
        })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setEnvironmentStatus({
            path: hdrPath,
            available: false,
            error: `${selectedEnvironment.label} HDRI failed to load. Using default preview lighting.`,
          })
        }
      })

    return () => controller.abort()
  }, [selectedEnvironment.hdrPath, selectedEnvironment.label])

  return (
    <div className="model-viewer" role="group" aria-label={ariaLabel}>
      <Canvas
        className="model-viewer__canvas"
        camera={{ position: PREVIEW_CAMERA_POSITION, fov: 42, near: 0.1, far: 200 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          // Commerce tone mapping compresses highlights while preserving
          // product colors and the shading in bright fabric/materials.
          gl.toneMapping = THREE.NeutralToneMapping
          gl.toneMappingExposure = 0.9
        }}
        dpr={pixelRatio}
        frameloop={visible ? 'always' : 'never'}
      >
        <SceneLights
          environmentId={selectedEnvironment.id}
          environmentFile={environmentFile}
          environmentIntensity={selectedEnvironment.environmentIntensity}
          lightMultiplier={selectedEnvironment.lightMultiplier}
          showBackground={selectedEnvironment.background}
          backgroundBlur={selectedEnvironment.backgroundBlur}
        />
        <SceneBackground
          showEnvironment={selectedEnvironment.background && Boolean(environmentFile)}
        />
        <Suspense fallback={null}>
          <PreviewModel
            key={modelUrl}
            url={modelUrl}
            wireframe={false}
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
              className={`model-viewer__chip${environmentId === option.id ? ' model-viewer__chip--active' : ''
                }`}
              role="radio"
              aria-checked={environmentId === option.id}
              onClick={() => setEnvironmentId(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
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

/**
 * Minimal recovery scene used when an optional HDRI or shadow effect fails.
 * Keeping this path free of environment textures and post-processing lets a
 * valid GLB remain usable on browsers that cannot render the enhanced scene.
 */
function StableModelViewerCanvas({
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
  return (
    <div className="model-viewer" role="group" aria-label={ariaLabel}>
      <Canvas
        className="model-viewer__canvas"
        camera={{ position: [0, 0.9, 2.8], fov: 42, near: 0.1, far: 200 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={pixelRatio}
        frameloop={visible ? 'always' : 'never'}
      >
        <ambientLight intensity={0.45} />
        <hemisphereLight args={['#ffffff', '#c4cad3', 0.5]} />
        <directionalLight position={[5, 8, 4]} intensity={1.1} />
        <Suspense fallback={null}>
          <PreviewModel key={modelUrl} url={modelUrl} wireframe={false} showGround={false} />
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
          <ErrorBoundary
            fallback={
              <div className="model-viewer model-viewer--empty">
                <ModelViewerError message="The preview model could not be loaded. It may be missing or unsupported." />
              </div>
            }
          >
            <StableModelViewerCanvas
              modelUrl={trimmedUrl}
              ariaLabel={ariaLabel}
              visible={visible}
              pixelRatio={pixelRatio}
            />
          </ErrorBoundary>
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
