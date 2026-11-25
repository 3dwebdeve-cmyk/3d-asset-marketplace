import { Suspense, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type PointerEvent } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, useEnvironment, useGLTF, useProgress } from '@react-three/drei'
import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'

import { ErrorBoundary } from '../ErrorBoundary'
import { adjustEnvironment, DEFAULT_ENVIRONMENT_ADJUSTMENTS, type EnvironmentAdjustments } from './adjustEnvironment'
import { applyWireframe } from './applyWireframe'
import { fitPreviewScene } from './fitPreviewScene'
import { clampPreviewZoom, framePreviewCamera, PREVIEW_CAMERA_POSITION } from './framePreviewCamera'
import { DEFAULT_HDRI_ENVIRONMENT_ID, HDRI_ENVIRONMENTS } from './hdriEnvironments'
import { isSafePreviewModelUrl } from './isSafePreviewModelUrl'
import { isWebGLAvailable } from './isWebGLAvailable'
import { useAdaptivePixelRatio, useAdaptiveShadowMapSize } from './useAdaptivePixelRatio'
import { useViewportVisibility } from './useViewportVisibility'
import '../../styles/model-viewer.css'

RectAreaLightUniformsLib.init()

export interface ModelViewerProps {
  modelUrl: string
  ariaLabel: string
  className?: string
  presentation?: {
    cameraPosition: [number, number, number]
  }
}

const ENTRANCE_DURATION = 1.5
const ENTRANCE_START_SCALE = 0.35
const ORBIT_AXIS = new THREE.Vector3(0, 1, 0)
const KEY_LIGHT_DISTANCE = 5
const DEFAULT_KEY_ELEVATION = Math.atan2(4, 3)

function directionalLightPosition(yaw: number, elevation: number, distance = KEY_LIGHT_DISTANCE): [number, number, number] {
  const horizontalDistance = distance * Math.cos(elevation)
  return [Math.sin(yaw) * horizontalDistance, distance * Math.sin(elevation), Math.cos(yaw) * horizontalDistance]
}
const SHADOW_LIGHT_INTENSITY = 0.9
const AMBIENT_FILL_INTENSITY = 0.15
const DEFAULT_SHADOW_RADIUS = 2.5

type StudioLighting = {
  ambient: number
  keyIntensity: number
  keyViewYawOffset: number
  keyElevation: number
  exposure: number
  /** Penumbra of the key light's shadow; bigger reads as a bigger, softer light. */
  shadowRadius?: number
}

function easeInOut(progress: number): number {
  return progress * progress * (3 - 2 * progress)
}

function applyOpeningOrbit(
  camera: THREE.Camera,
  view: { center: THREE.Vector3; offset: THREE.Vector3 },
  progress: number,
) {
  const angleFromFront = Math.PI * (progress - 1)
  camera.position.copy(view.offset).applyAxisAngle(ORBIT_AXIS, angleFromFront).add(view.center)
  camera.lookAt(view.center)
}

function PreviewModel({
  url,
  wireframe,
  openingOrbit,
  lightYaw,
  lightElevation,
  lightDistance = KEY_LIGHT_DISTANCE,
  lightIntensity,
  shadowRadius = DEFAULT_SHADOW_RADIUS,
  contactShadowOpacity = 0.25,
  detailedSelfShadows,
  cameraPosition,
}: {
  url: string
  wireframe: boolean
  openingOrbit: { cancelled: boolean; manualCamera: boolean }
  lightYaw: number
  lightElevation: number
  lightDistance?: number
  lightIntensity: number
  shadowRadius?: number
  contactShadowOpacity?: number
  detailedSelfShadows: boolean
  cameraPosition?: [number, number, number]
}) {
  const { scene } = useGLTF(url)
  const modelGroup = useRef<THREE.Group>(null)
  const shadowLight = useRef<THREE.DirectionalLight>(null)
  const [entranceComplete, setEntranceComplete] = useState(false)
  const shadowResolution = useAdaptiveShadowMapSize()
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false),
    [],
  )
  const entranceTime = useRef(0)
  const openingView = useRef<{ center: THREE.Vector3; offset: THREE.Vector3 } | null>(null)
  // clone(true) shares geometries/materials with the useGLTF cache — never dispose them here.
  const fitted = useMemo(() => {
    const model = fitPreviewScene(scene)
    model.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      mesh.castShadow = materials.some((material) => !material.transparent)
      mesh.receiveShadow = true
    })
    return model
  }, [scene])
  const bounds = useMemo(() => new THREE.Box3().setFromObject(fitted), [fitted])
  // A tighter light-space frame gives small gaps between surfaces more shadow-map texels.
  const shadowHalfExtent = detailedSelfShadows && !bounds.isEmpty()
    ? Math.max(0.5, bounds.getBoundingSphere(new THREE.Sphere()).radius + 0.1)
    : 1.7
  const ground = useMemo(() => {
    if (bounds.isEmpty()) return null
    const size = bounds.getSize(new THREE.Vector3())
    return {
      y: bounds.min.y - 0.008,
      scale: Math.max(size.x, size.z, 0.5) * 2,
      far: Math.max(size.y * 1.5, 0.5),
    }
  }, [bounds])
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const controls = useThree((state) => state.controls)
  const invalidate = useThree((state) => state.invalidate)
  const shadowsReady = Boolean(ground) && (reducedMotion || entranceComplete)

  useLayoutEffect(() => {
    const shadow = shadowLight.current?.shadow
    if (!shadowsReady || !shadow) return
    shadow.camera.updateProjectionMatrix()
    shadow.needsUpdate = true
    invalidate()
  }, [fitted, lightIntensity, lightYaw, lightElevation, lightDistance, shadowHalfExtent, detailedSelfShadows, shadowResolution, shadowsReady, invalidate])

  useFrame((_, delta) => {
    if (reducedMotion || entranceTime.current >= ENTRANCE_DURATION || !modelGroup.current) return

    const time = Math.min(entranceTime.current + Math.min(delta, 0.25), ENTRANCE_DURATION)
    entranceTime.current = time
    const progress = easeInOut(time / ENTRANCE_DURATION)
    modelGroup.current.scale.setScalar(ENTRANCE_START_SCALE + (1 - ENTRANCE_START_SCALE) * progress)

    const view = openingView.current
    if (!openingOrbit.cancelled && view) {
      applyOpeningOrbit(camera, view, progress)
    }
    if (time === ENTRANCE_DURATION) setEntranceComplete(true)
  })

  useLayoutEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || size.width <= 0 || size.height <= 0) return
    const center = framePreviewCamera(camera, fitted, size.width / size.height, cameraPosition)
    if (!center) return
    const orbit = controls as {
      target?: THREE.Vector3
      update?: () => void
      saveState?: () => void
    } | null
    orbit?.target?.copy(center)
    orbit?.update?.()
    orbit?.saveState?.()
    const view = { center, offset: camera.position.clone().sub(center) }
    openingView.current = view
    if (!reducedMotion && !openingOrbit.cancelled && entranceTime.current < ENTRANCE_DURATION) {
      applyOpeningOrbit(camera, view, easeInOut(entranceTime.current / ENTRANCE_DURATION))
    }
    invalidate()
  }, [camera, cameraPosition, controls, fitted, size.width, size.height, invalidate, openingOrbit, reducedMotion])

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return
    const orbit = controls as ComponentRef<typeof OrbitControls> | null
    function clamp() {
      if (openingOrbit.manualCamera && orbit && camera instanceof THREE.PerspectiveCamera) {
        clampPreviewZoom(camera, bounds, orbit.target)
      }
    }
    orbit?.addEventListener?.('change', clamp)
    return () => orbit?.removeEventListener?.('change', clamp)
  }, [camera, controls, bounds, openingOrbit])

  useEffect(() => {
    applyWireframe(fitted, wireframe)

    return () => {
      applyWireframe(fitted, false)
    }
  }, [fitted, wireframe])

  const lightPosition = directionalLightPosition(lightYaw, lightElevation, lightDistance)

  return (
    <>
      <directionalLight
        key={shadowResolution}
        ref={shadowLight}
        position={lightPosition}
        intensity={lightIntensity}
        castShadow={shadowsReady}
        shadow-autoUpdate={false}
        shadow-mapSize={[shadowResolution, shadowResolution]}
        shadow-camera-left={-shadowHalfExtent}
        shadow-camera-right={shadowHalfExtent}
        shadow-camera-top={shadowHalfExtent}
        shadow-camera-bottom={-shadowHalfExtent}
        shadow-camera-near={2}
        shadow-camera-far={lightDistance + 3}
        shadow-normalBias={detailedSelfShadows ? 0.002 : 0.006}
        shadow-bias={-0.0002}
        shadow-radius={shadowRadius}
      />
      <group ref={modelGroup} scale={reducedMotion ? 1 : ENTRANCE_START_SCALE}>
        <primitive object={fitted} />
      </group>
      {ground && shadowsReady ? (
        <ContactShadows
          position={[0, ground.y, 0]}
          scale={ground.scale}
          far={ground.far}
          blur={3.4}
          opacity={contactShadowOpacity}
          resolution={shadowResolution}
          frames={1}
        />
      ) : null}
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

const VIEWER_BACKGROUNDS = [
  undefined,
  'radial-gradient(ellipse farthest-side at center, #686868 0%, #555555 55%, #3C3C3C 100%)',
  'radial-gradient(ellipse farthest-side at center, #333C4D 0%, #202633 55%, #11151E 100%)',
  'radial-gradient(ellipse farthest-side at center, #4E5459 0%, #373C40 55%, #202326 100%)',
] as const

type LightAdjustments = EnvironmentAdjustments & { brightness: number }

const DEFAULT_VIEWER_BRIGHTNESS = 3
const DEFAULT_VIEWER_ENVIRONMENT = {
  ...DEFAULT_ENVIRONMENT_ADJUSTMENTS,
  contrast: -14,
  exposure: -1.1,
  saturation: -4,
  highlights: -32,
  shadows: -45,
  gamma: -0.1,
}

const LIGHT_SLIDERS = [
  { key: 'brightness', label: 'Brightness', min: -75, max: 100, step: 1, unit: '%' },
  { key: 'contrast', label: 'Contrast', min: -50, max: 50, step: 1, unit: '%' },
  { key: 'exposure', label: 'Exposure', min: -2, max: 2, step: 0.1, unit: ' EV' },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1, unit: '%' },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1, unit: '%' },
  { key: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1, unit: '%' },
  { key: 'gamma', label: 'Gamma', min: -0.5, max: 1, step: 0.05, unit: '' },
  { key: 'sharpness', label: 'Sharpness', min: -100, max: 100, step: 1, unit: '%' },
] as const

function ViewerEnvironment({ files, intensity, yaw, adjustments }: {
  files: string
  intensity: number
  yaw: number
  adjustments: EnvironmentAdjustments
}) {
  const source = useEnvironment({ files })
  const [filtered, setFiltered] = useState(adjustments)

  useEffect(() => {
    // Environment maps are expensive to filter and upload. Coalesce rapid slider inputs.
    const timeout = window.setTimeout(() => setFiltered(adjustments), 90)
    return () => window.clearTimeout(timeout)
  }, [adjustments])

  const map = useMemo(
    () => adjustEnvironment(source, filtered),
    [source, filtered],
  )
  useEffect(() => {
    if (map !== source) return () => map.dispose()
  }, [map, source])

  return (
    <Environment
      map={map}
      background={false}
      environmentIntensity={intensity}
      environmentRotation={[0, yaw, 0]}
    />
  )
}

function ViewerExposure({ exposure }: { exposure?: number }) {
  const renderer = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)

  useLayoutEffect(() => {
    if (!renderer || exposure === undefined) return
    const previousExposure = renderer.toneMappingExposure
    renderer.toneMappingExposure = exposure
    invalidate()
    return () => {
      renderer.toneMappingExposure = previousExposure
      invalidate()
    }
  }, [renderer, exposure, invalidate])

  return null
}

type ViewerBackgroundProps = {
  background?: string
  onBackgroundChange: () => void
}

function ViewerToolbar({
  controls,
  onBackgroundChange,
  onCameraInteraction,
  onResetCamera,
  adjustments,
  onAdjustmentChange,
  onResetAdjustments,
}: {
  controls: { current: ComponentRef<typeof OrbitControls> | null }
  onBackgroundChange: () => void
  onCameraInteraction: () => void
  onResetCamera: () => void
  adjustments: LightAdjustments
  onAdjustmentChange: (key: keyof LightAdjustments, value: number) => void
  onResetAdjustments: () => void
}) {
  const toolbar = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [showLightControls, setShowLightControls] = useState(false)
  const lightControlsId = useId()

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
    <>
      <div ref={toolbar} className="model-viewer__toolbar" role="group" aria-label="3D view actions">
        <button type="button" onClick={onBackgroundChange} aria-label="Change background color">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /><path d="m6 15 4-4 8 7" /></svg>
          BG Color
        </button>
        <button
          type="button"
          aria-expanded={showLightControls}
          aria-controls={lightControlsId}
          onClick={() => setShowLightControls((open) => !open)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" /></svg>
          Light Controls
        </button>
        <button type="button" onClick={() => {
        onResetCamera()
          const orbit = controls.current
          if (!orbit) return
          const damping = orbit.enableDamping
          orbit.enableDamping = false
          orbit.update()
          orbit.reset()
          orbit.enableDamping = damping
        }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v5H7m5-2a7 7 0 1 1-7 7" /></svg>
          Reset
        </button>
        <button type="button" onClick={() => {
          onCameraInteraction()
          controls.current?.dollyIn(0.8)
        }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12m-6-6v12" /></svg>
          Zoom In
        </button>
        <button type="button" onClick={() => {
          onCameraInteraction()
          controls.current?.dollyOut(0.8)
        }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>
          Zoom Out
        </button>
        <button type="button" onClick={() => void toggleFullscreen()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5H5v4m10-4h4v4m0 6v4h-4m-6 0H5v-4" /></svg>
          {fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
      </div>
      <div id={lightControlsId} className="model-viewer__adjustments" role="group" aria-label="HDRI light adjustments" hidden={!showLightControls}>
        {LIGHT_SLIDERS.map(({ key, label, min, max, step, unit }) => {
          const value = adjustments[key]
          return (
            <label key={key}>
              <span>{label}</span>
              <span aria-hidden="true">{value > 0 ? '+' : ''}{value}{unit}</span>
              <input
                type="range"
                aria-label={label}
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => onAdjustmentChange(key, event.currentTarget.valueAsNumber)}
              />
            </label>
          )
        })}
        <button type="button" onClick={onResetAdjustments}>Reset adjustments</button>
      </div>
    </>
  )
}

function ModelViewerCanvas({
  modelUrl,
  ariaLabel,
  visible,
  pixelRatio,
  background,
  onBackgroundChange,
  presentation,
}: ViewerBackgroundProps & {
  modelUrl: string
  ariaLabel: string
  visible: boolean
  pixelRatio: number
  presentation?: ModelViewerProps['presentation']
}) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const openingOrbit = useMemo(() => ({ cancelled: false, manualCamera: false }), [modelUrl])
  const cancelOpeningOrbit = () => { openingOrbit.cancelled = true }
  const startManualCamera = () => {
    cancelOpeningOrbit()
    openingOrbit.manualCamera = true
  }
  const [preset, setPreset] = useState<(typeof HDRI_ENVIRONMENTS)[number]>(
    () => HDRI_ENVIRONMENTS.find((option) => option.id === DEFAULT_HDRI_ENVIRONMENT_ID)!,
  )
  const studio: StudioLighting | undefined = 'studio' in preset ? preset.studio : undefined
  const [lightingYaw, setLightingYaw] = useState(0)
  const [brightness, setBrightness] = useState(DEFAULT_VIEWER_BRIGHTNESS)
  const [environmentAdjustments, setEnvironmentAdjustments] = useState(DEFAULT_VIEWER_ENVIRONMENT)
  const cameraPosition = presentation?.cameraPosition ?? PREVIEW_CAMERA_POSITION
  const openingCameraYaw = Math.atan2(cameraPosition[0], cameraPosition[2])
  const studioKeyYaw = studio ? openingCameraYaw + studio.keyViewYawOffset + lightingYaw : undefined
  // Presets whose sun is painted on +Z turn with the key light so both always agree.
  const environmentYaw = 'sunFollowsKey' in preset && studioKeyYaw !== undefined
    ? studioKeyYaw
    : preset.yaw + lightingYaw
  const brightnessMultiplier = 1 + brightness / 100
  const isBananaModel = /banana/i.test(modelUrl + ' ' + ariaLabel)
  const emphasizeBananaShadows = isBananaModel && preset.id === 'small-08'
  const hasPcCaseFrontFill = (preset.id === 'small-08' || preset.id === 'small-09')
    && /pc(?:[-_\s]|%20)*(?:case|cabinet)/i.test(modelUrl + ' ' + ariaLabel)
  const hasPcCaseStudioLighting = hasPcCaseFrontFill && preset.id === 'small-09'
  const contactShadowOpacity = hasPcCaseStudioLighting
    ? 0.65
    : 'contactShadowOpacity' in preset ? preset.contactShadowOpacity : undefined
  // Lower the ambient HDRI fill so the directional shadow is visible between overlapping bananas.
  const environmentIntensity = preset.intensity * brightnessMultiplier * (emphasizeBananaShadows ? 0.35 : 1)
  const keyIntensity = (studio?.keyIntensity ?? SHADOW_LIGHT_INTENSITY) * brightnessMultiplier * (emphasizeBananaShadows ? 1.15 : 1)
  const detailedSelfShadows = preset.id === 'small-09' || isBananaModel
  const upperRightLight = 'upperRightLight' in preset ? preset.upperRightLight : undefined
  const fillLights = 'fillLights' in preset ? preset.fillLights : undefined
  const frontRightYaw = openingCameraYaw + (preset.id === 'small-09' ? Math.PI / 3 : Math.PI / 6)
  const frontRightElevation = preset.id === 'small-09' ? -Math.PI / 6 : -Math.PI / 9
  const studio09FillDistance = KEY_LIGHT_DISTANCE + 2.5
  const frontRightPosition = directionalLightPosition(
    frontRightYaw,
    frontRightElevation,
    preset.id === 'small-09' ? studio09FillDistance + 0.25 : KEY_LIGHT_DISTANCE,
  )
  const frontLeftYaw = openingCameraYaw - Math.PI / 4
  const frontLeftElevation = -(7 * Math.PI) / 36
  const frontLeftPosition = directionalLightPosition(frontLeftYaw, frontLeftElevation, studio09FillDistance)
  const frontLeftPitch = Math.atan2(
    -0.25 - frontLeftPosition[1],
    Math.hypot(frontLeftPosition[0], frontLeftPosition[2]),
  )
  const lowerLeftYaw = openingCameraYaw - (2 * Math.PI) / 5
  const lowerLeftElevation = -(2 * Math.PI) / 9
  const upperRightSoftboxYaw = openingCameraYaw + (5 * Math.PI) / 12
  const upperRightSoftboxElevation = (2 * Math.PI) / 9
  const overheadLightYaw = openingCameraYaw + Math.PI
  const overheadLightHeight = KEY_LIGHT_DISTANCE * Math.sin(Math.PI / 3) - 1.25
  const overheadLightSetback = KEY_LIGHT_DISTANCE * Math.cos(Math.PI / 3) + 4
  const overheadLightElevation = Math.atan2(overheadLightHeight, overheadLightSetback)
  const lightDrag = useRef<{ pointerId: number; x: number } | null>(null)

  function startLightDrag(event: PointerEvent<HTMLDivElement>) {
    if (!event.altKey || event.button !== 0 || lightDrag.current) return
    cancelOpeningOrbit()
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
          style={background ? { backgroundImage: background } : undefined}
          camera={{ position: cameraPosition, fov: 42, near: 0.1, far: 200 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          dpr={pixelRatio}
          shadows="percentage"
          frameloop={visible ? 'always' : 'never'}
        >
          <ViewerExposure exposure={studio?.exposure} />
          <ambientLight intensity={studio?.ambient ?? AMBIENT_FILL_INTENSITY} />
          <ErrorBoundary key={preset.id} fallback={<ambientLight intensity={1} />}>
            <Suspense fallback={null}>
              <ViewerEnvironment
                files={preset.hdrPath}
                intensity={environmentIntensity}
                yaw={environmentYaw}
                adjustments={environmentAdjustments}
              />
            </Suspense>
          </ErrorBoundary>
          <Suspense fallback={null}>
            <PreviewModel
              key={modelUrl}
              url={modelUrl}
              wireframe={false}
              openingOrbit={openingOrbit}
              cameraPosition={presentation?.cameraPosition}
              lightYaw={studioKeyYaw ?? environmentYaw}
              shadowRadius={studio?.shadowRadius}
              contactShadowOpacity={contactShadowOpacity}
              lightElevation={(studio?.keyElevation ?? DEFAULT_KEY_ELEVATION) - (hasPcCaseStudioLighting ? Math.PI / 12 : 0)}
              lightDistance={hasPcCaseStudioLighting ? studio09FillDistance : undefined}
              lightIntensity={keyIntensity * (hasPcCaseStudioLighting ? 0.82 : 1)}
              detailedSelfShadows={detailedSelfShadows}
            />
            {upperRightLight && (
              <directionalLight
                position={directionalLightPosition(
                  openingCameraYaw + upperRightLight.viewYawOffset + lightingYaw,
                  upperRightLight.elevation - (hasPcCaseStudioLighting ? (5 * Math.PI) / 36 : 0),
                  hasPcCaseStudioLighting ? studio09FillDistance : undefined,
                )}
                intensity={keyIntensity * (hasPcCaseStudioLighting ? 0.82 : 1)}
              />
            )}
            {fillLights?.map(({ name, viewYawOffset, elevation, intensity, width, height }) => {
              const yaw = openingCameraYaw + viewYawOffset + lightingYaw
              return (
                <rectAreaLight
                  key={name}
                  position={directionalLightPosition(yaw, elevation)}
                  rotation={[-elevation, yaw, 0, 'YXZ']}
                  intensity={intensity * brightnessMultiplier * (emphasizeBananaShadows ? 0.5 : 1)}
                  width={width}
                  height={height}
                />
              )
            })}
            {hasPcCaseFrontFill && (
              <rectAreaLight
                position={frontRightPosition}
                rotation={[-frontRightElevation, frontRightYaw, 0, 'YXZ']}
                intensity={(preset.id === 'small-09' ? 0.52 : 0.14) * brightnessMultiplier}
                width={preset.id === 'small-09' ? 12.5 : 2}
                height={preset.id === 'small-09' ? 8.75 : 2}
              />
            )}
            {hasPcCaseStudioLighting && (
              <rectAreaLight
                position={frontLeftPosition}
                rotation={[frontLeftPitch, frontLeftYaw, 0, 'YXZ']}
                intensity={0.25 * brightnessMultiplier}
                width={10}
                height={6.75}
              />
            )}
            {hasPcCaseStudioLighting && (
              <rectAreaLight
                position={directionalLightPosition(lowerLeftYaw, lowerLeftElevation, studio09FillDistance + 0.25)}
                rotation={[-lowerLeftElevation, lowerLeftYaw, 0, 'YXZ']}
                intensity={0.22 * brightnessMultiplier}
                width={4.25}
                height={3.5}
              />
            )}
            {hasPcCaseStudioLighting && (
              <rectAreaLight
                position={directionalLightPosition(upperRightSoftboxYaw, upperRightSoftboxElevation, studio09FillDistance + 1.25)}
                rotation={[-upperRightSoftboxElevation, upperRightSoftboxYaw, 0, 'YXZ']}
                intensity={0.45 * brightnessMultiplier}
                width={13}
                height={8}
              />
            )}
            {hasPcCaseStudioLighting && (
              <rectAreaLight
                position={directionalLightPosition(overheadLightYaw, overheadLightElevation, Math.hypot(overheadLightHeight, overheadLightSetback))}
                rotation={[-overheadLightElevation, overheadLightYaw, 0, 'YXZ']}
                intensity={0.74 * brightnessMultiplier}
                width={16.5}
                height={11.5}
              />
            )}
          </Suspense>
          <OrbitControls
            ref={controls}
            makeDefault
            onStart={startManualCamera}
            enableDamping
            dampingFactor={0.08}
            minDistance={0.001}
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
        adjustments={{ ...environmentAdjustments, brightness }}
        onAdjustmentChange={(key, value) => {
          if (key === 'brightness') setBrightness(value)
          else setEnvironmentAdjustments((current) => ({ ...current, [key]: value }))
        }}
        onResetAdjustments={() => {
          setBrightness(DEFAULT_VIEWER_BRIGHTNESS)
          setEnvironmentAdjustments(DEFAULT_VIEWER_ENVIRONMENT)
        }}
        onBackgroundChange={onBackgroundChange}
        onCameraInteraction={startManualCamera}
        onResetCamera={() => {
          cancelOpeningOrbit()
          openingOrbit.manualCamera = false
        }}
      />
      <ViewerProgressOverlay />
    </div>
  )
}

export function ModelViewer({ modelUrl, ariaLabel, className, presentation }: ModelViewerProps) {
  const [backgroundIndex, setBackgroundIndex] = useState(0)
  const background = VIEWER_BACKGROUNDS[backgroundIndex]
  const cycleBackground = () => setBackgroundIndex((index) => (index + 1) % VIEWER_BACKGROUNDS.length)
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
          presentation={presentation}
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
