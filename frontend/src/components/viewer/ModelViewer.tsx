import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type PointerEvent } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import * as THREE from 'three'

import { ErrorBoundary } from '../ErrorBoundary'
import { applyWireframe } from './applyWireframe'
import { fitPreviewScene } from './fitPreviewScene'
import { framePreviewCamera, PREVIEW_CAMERA_POSITION } from './framePreviewCamera'
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

const ENTRANCE_DURATION = 1.5
const ENTRANCE_START_SCALE = 0.35

function PreviewModel({
  url,
  wireframe,
}: {
  url: string
  wireframe: boolean
}) {
  const { scene } = useGLTF(url)
  const modelGroup = useRef<THREE.Group>(null)
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false),
    [],
  )
  const entranceTime = useRef(0)
  useFrame((_, delta) => {
    if (reducedMotion || entranceTime.current >= ENTRANCE_DURATION || !modelGroup.current) return
    entranceTime.current = Math.min(entranceTime.current + Math.min(delta, 0.05), ENTRANCE_DURATION)
    const progress = entranceTime.current / ENTRANCE_DURATION
    const eased = progress * progress * (3 - 2 * progress)
    modelGroup.current.scale.setScalar(ENTRANCE_START_SCALE + (1 - ENTRANCE_START_SCALE) * eased)
  })
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

  useEffect(() => {
    applyWireframe(fitted, wireframe)

    return () => {
      applyWireframe(fitted, false)
    }
  }, [fitted, wireframe])

  return (
    <group ref={modelGroup} scale={reducedMotion ? 1 : ENTRANCE_START_SCALE}>
      <primitive object={fitted} />
    </group>
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

const ALTERNATE_BACKGROUND = '#a7a3a5'

type ViewerBackgroundProps = {
  background?: string
  onBackgroundChange: () => void
}

function ViewerToolbar({
  controls,
  onBackgroundChange,
}: {
  controls: { current: ComponentRef<typeof OrbitControls> | null }
  onBackgroundChange: () => void
}) {
  const toolbar = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)

  function fullscreenTarget() {
    return toolbar.current?.closest<HTMLElement>('.product-detail-stage__viewer')
      ?? toolbar.current?.closest<HTMLElement>('.model-viewer-shell')
  }

  useEffect(() => {
    function syncFullscreen() {
      setFullscreen(Boolean(document.fullscreenElement && document.fullscreenElement === fullscreenTarget()))
    }
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  async function toggleFullscreen() {
    const target = fullscreenTarget()
    try {
      if (target && document.fullscreenElement === target) {
        await document.exitFullscreen?.()
      } else {
        await target?.requestFullscreen?.()
      }
    } catch {
      // Browsers can reject fullscreen for embedded viewers.
    }
  }

  return (
    <div ref={toolbar} className="model-viewer__toolbar" role="group" aria-label="3D view actions">
      <button type="button" onClick={onBackgroundChange} aria-label="Change background color">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /><path d="m6 15 4-4 8 7" /></svg>
        BG Color
      </button>
      <button type="button" onClick={() => controls.current?.reset()}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v5H7m5-2a7 7 0 1 1-7 7" /></svg>
        Reset
      </button>
      <button type="button" onClick={() => controls.current?.dollyIn(0.8)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12m-6-6v12" /></svg>
        Zoom In
      </button>
      <button type="button" onClick={() => controls.current?.dollyOut(0.8)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>
        Zoom Out
      </button>
      <button type="button" onClick={() => void toggleFullscreen()}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5H5v4m10-4h4v4m0 6v4h-4m-6 0H5v-4" /></svg>
        {fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
      </button>
    </div>
  )
}

function ModelViewerCanvas({
  modelUrl,
  ariaLabel,
  visible,
  pixelRatio,
  background,
  onBackgroundChange,
}: ViewerBackgroundProps & {
  modelUrl: string
  ariaLabel: string
  visible: boolean
  pixelRatio: number
}) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const [preset, setPreset] = useState<(typeof HDRI_ENVIRONMENTS)[number]>(
    () => HDRI_ENVIRONMENTS.find((option) => option.id === DEFAULT_HDRI_ENVIRONMENT_ID)!,
  )
  const [lightingYaw, setLightingYaw] = useState(0)
  const lightDrag = useRef<{ pointerId: number; x: number } | null>(null)

  function startLightDrag(event: PointerEvent<HTMLDivElement>) {
    if (!event.altKey || event.button !== 0 || lightDrag.current) return
    event.preventDefault()
    event.stopPropagation()
    if (controls.current) controls.current.enabled = false
    lightDrag.current = { pointerId: event.pointerId, x: event.clientX }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveLightDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = lightDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    const delta = (event.clientX - drag.x) / event.currentTarget.clientWidth * Math.PI * 2
    drag.x = event.clientX
    if (Number.isFinite(delta)) setLightingYaw((yaw) => (yaw + delta) % (Math.PI * 2))
  }

  function finishLightDrag(event: PointerEvent<HTMLDivElement>) {
    if (lightDrag.current?.pointerId !== event.pointerId) return
    event.stopPropagation()
    lightDrag.current = null
    if (controls.current) controls.current.enabled = true
  }

  return (
    <div className="model-viewer" role="group" aria-label={ariaLabel}>
      <div
        className="model-viewer__surface"
        onPointerDownCapture={startLightDrag}
        onPointerMoveCapture={moveLightDrag}
        onPointerUpCapture={finishLightDrag}
        onPointerCancelCapture={finishLightDrag}
        onLostPointerCapture={finishLightDrag}
      >
        <Canvas
          className="model-viewer__canvas"
          style={background ? { backgroundColor: background } : undefined}
          camera={{ position: PREVIEW_CAMERA_POSITION, fov: 42, near: 0.1, far: 200 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          dpr={pixelRatio}
          frameloop={visible ? 'always' : 'never'}
        >
          <ambientLight intensity={0.45} />
          <ErrorBoundary key={preset.id} fallback={<ambientLight intensity={1} />}>
            <Suspense fallback={null}>
              <Environment
                files={preset.hdrPath}
                background={false}
                environmentIntensity={preset.intensity}
                environmentRotation={[0, preset.yaw + lightingYaw, 0]}
              />
            </Suspense>
          </ErrorBoundary>
          <Suspense fallback={null}>
            <PreviewModel
              key={modelUrl}
              url={modelUrl}
              wireframe={false}
            />
          </Suspense>
          <OrbitControls
            ref={controls}
            makeDefault
            enableDamping
            dampingFactor={0.08}
            minDistance={0.5}
            maxDistance={20}
            maxPolarAngle={Math.PI * 0.92}
          />
        </Canvas>
      </div>
      <div className="model-viewer__lighting" role="group" aria-label="Lighting presets">
        {HDRI_ENVIRONMENTS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={preset.id === option.id}
            onClick={() => {
              setPreset(option)
              setLightingYaw(0)
            }}
          >
            {option.label}
          </button>
        ))}
        <span>Alt + drag to rotate lighting</span>
      </div>
      <ViewerToolbar
        controls={controls}
        onBackgroundChange={onBackgroundChange}
      />
      <ViewerProgressOverlay />
    </div>
  )
}

export function ModelViewer({ modelUrl, ariaLabel, className }: ModelViewerProps) {
  const [useAlternateBackground, setUseAlternateBackground] = useState(false)
  const background = useAlternateBackground ? ALTERNATE_BACKGROUND : undefined
  const cycleBackground = () => setUseAlternateBackground((enabled) => !enabled)
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
          background={background}
          onBackgroundChange={cycleBackground}
        />
      </ErrorBoundary>
    </div>
  )
}

export default ModelViewer
