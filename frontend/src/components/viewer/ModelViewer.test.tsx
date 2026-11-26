import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useImperativeHandle, type Ref } from 'react'
import { BoxGeometry, Mesh, Object3D, PerspectiveCamera, Scene, Vector3 } from 'three'
import { useFrame } from '@react-three/fiber'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const viewerMocks = vi.hoisted(() => {
  return {
    scene: null as import('three').Object3D | null,
    renderScene: null as import('three').Scene | null,
    renderer: { toneMappingExposure: 1 },
    camera: null as import('three').PerspectiveCamera | null,
    size: { width: 900, height: 450 },
    controls: null as { target: import('three').Vector3; update: () => void; saveState: () => void } | null,
    invalidate: vi.fn(),
    toolbarControls: { reset: vi.fn(), update: vi.fn(), dollyIn: vi.fn(), dollyOut: vi.fn(), enableDamping: true },
    clearGltfCache: vi.fn(),
    visible: true,
    webglAvailable: true,
    pixelRatio: 1.25,
  }
})

vi.mock('@react-three/fiber', () => ({
  useFrame: vi.fn(),
  Canvas: ({
    children,
    frameloop,
    dpr,
    style,
  }: {
    children?: import('react').ReactNode
    frameloop?: string
    dpr?: number
    style?: import('react').CSSProperties
  }) => (
    <div data-testid="r3f-canvas" data-frameloop={frameloop} data-dpr={dpr} style={style}>
      {children}
    </div>
  ),
  useThree: (selector?: (state: {
    scene: import('three').Scene
    gl: typeof viewerMocks.renderer
    camera: import('three').PerspectiveCamera
    size: { width: number; height: number }
    controls: typeof viewerMocks.controls
    invalidate: () => void
  }) => unknown) => {
    const state = {
      scene: viewerMocks.renderScene ?? new Scene(),
      gl: viewerMocks.renderer,
      camera: viewerMocks.camera!,
      size: viewerMocks.size,
      controls: viewerMocks.controls,
      invalidate: viewerMocks.invalidate,
    }
    return selector ? selector(state) : state
  },
}))

vi.mock('@react-three/drei', () => ({
  OrbitControls: ({ ref }: { ref: Ref<typeof viewerMocks.toolbarControls> }) => {
    useImperativeHandle(ref, () => viewerMocks.toolbarControls)
    return null
  },
  useEnvironment: ({ files }: { files: string }) => ({ name: files }),
  Environment: ({ map, background, environmentIntensity, environmentRotation, backgroundRotation, backgroundIntensity, backgroundBlurriness }: {
    map: { name: string }; background: boolean; environmentIntensity: number
    environmentRotation?: number[]; backgroundRotation?: number[]
    backgroundIntensity?: number; backgroundBlurriness?: number
  }) => (
    <div data-testid="viewer-environment" data-files={map.name} data-background={background} data-intensity={environmentIntensity}
      data-environment-yaw={environmentRotation?.[1]} data-background-yaw={backgroundRotation?.[1]}
      data-background-intensity={backgroundIntensity} data-background-blur={backgroundBlurriness} />
  ),
  ContactShadows: () => <div data-testid="viewer-shadow" />,
  useGLTF: Object.assign(
    () => ({
      scene: viewerMocks.scene ?? new Object3D(),
    }),
    { clear: viewerMocks.clearGltfCache },
  ),
  useProgress: () => ({ active: false, progress: 100, loaded: 1, total: 1 }),
}))

vi.mock('./isWebGLAvailable', () => ({
  isWebGLAvailable: () => viewerMocks.webglAvailable,
}))

vi.mock('./useAdaptivePixelRatio', () => ({
  useAdaptivePixelRatio: () => viewerMocks.pixelRatio,
  useAdaptiveShadowMapSize: () => 512,
}))

vi.mock('./useViewportVisibility', () => ({
  useViewportVisibility: () => ({
    ref: { current: null },
    visible: viewerMocks.visible,
  }),
}))

import { ModelViewer } from './ModelViewer'

describe('ModelViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    viewerMocks.scene = new Object3D()
    viewerMocks.renderScene = new Scene()
    viewerMocks.renderer = { toneMappingExposure: 1 }
    viewerMocks.camera = new PerspectiveCamera(42, 2, 0.1, 200)
    viewerMocks.camera.position.set(0, 0.9, 2.3)
    viewerMocks.size = { width: 900, height: 450 }
    viewerMocks.controls = { target: new Vector3(3, 4, 5), update: vi.fn(), saveState: vi.fn() }
    viewerMocks.visible = true
    viewerMocks.webglAvailable = true
    viewerMocks.pixelRatio = 1.25
  })

  it('zooms and completes a half orbit together from rear to front', () => {
    viewerMocks.scene = new Mesh(new BoxGeometry(1, 2, 1))
    const { container } = render(<ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Preview" />)
    const group = container.querySelector('group')!
    const setScalar = vi.fn()
    Object.defineProperty(group, 'scale', { value: { setScalar }, configurable: true })
    const frame = vi.mocked(useFrame).mock.calls.at(-1)![0]
    const center = viewerMocks.controls!.target
    const openingOffset = viewerMocks.camera!.position.clone().sub(center)
    expect(openingOffset.x).toBeGreaterThan(0)
    expect(openingOffset.z).toBeLessThan(0)
    expect(group).toHaveAttribute('scale', '0.35')
    expect(screen.queryByTestId('viewer-shadow')).not.toBeInTheDocument()
    act(() => frame({} as never, 0.05, undefined))
    expect(setScalar.mock.calls[0][0]).toBeGreaterThan(0.35)
    expect(viewerMocks.camera!.position.clone().sub(center).distanceTo(openingOffset)).toBeGreaterThan(0)
    act(() => { for (let i = 0; i < 14; i += 1) frame({} as never, 0.05, undefined) })
    expect(setScalar.mock.calls.at(-1)![0]).toBeLessThan(1)
    const halfway = viewerMocks.camera!.position.clone().sub(center)
    expect(halfway.x * openingOffset.x + halfway.z * openingOffset.z).toBeCloseTo(0)
    act(() => { for (let i = 0; i < 16; i += 1) frame({} as never, 0.05, undefined) })
    expect(setScalar.mock.calls.at(-1)![0]).toBeCloseTo(1)
    expect(screen.getByTestId('viewer-shadow')).toBeInTheDocument()
    const offset = viewerMocks.camera!.position.clone().sub(center)
    expect(offset.x).toBeCloseTo(-openingOffset.x)
    expect(offset.y).toBeCloseTo(openingOffset.y)
    expect(offset.z).toBeCloseTo(-openingOffset.z)
    expect(offset.x).toBeLessThan(0)
    expect(offset.z).toBeGreaterThan(0)
  })

  it('stops the opening orbit when Reset is clicked', async () => {
    viewerMocks.scene = new Mesh(new BoxGeometry(1, 2, 1))
    const { container } = render(<ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Preview" />)
    Object.defineProperty(container.querySelector('group')!, 'scale', { value: { setScalar: vi.fn() } })
    const frame = vi.mocked(useFrame).mock.calls.at(-1)![0]
    act(() => { for (let i = 0; i < 15; i += 1) frame({} as never, 0.05, undefined) })
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
    const resetPosition = viewerMocks.camera!.position.clone()
    act(() => { for (let i = 0; i < 30; i += 1) frame({} as never, 0.05, undefined) })
    expect(viewerMocks.toolbarControls.reset).toHaveBeenCalledOnce()
    expect(viewerMocks.camera!.position.equals(resetPosition)).toBe(true)
  })

  it('skips the entrance animation when reduced motion is preferred', () => {
    viewerMocks.scene = new Mesh(new BoxGeometry(1, 2, 1))
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    try {
      const { container } = render(<ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Preview" />)
      const group = container.querySelector('group')!
      const setScalar = vi.fn()
      Object.defineProperty(group, 'scale', { value: { setScalar }, configurable: true })
      const frame = vi.mocked(useFrame).mock.calls.at(-1)![0]
      act(() => frame({} as never, 0.05, undefined))
      expect(setScalar).not.toHaveBeenCalled()
      const offset = viewerMocks.camera!.position.clone().sub(viewerMocks.controls!.target)
      expect(offset.x).toBeLessThan(0)
      expect(offset.z).toBeGreaterThan(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('fits loaded models on entry and resize while keeping user zoom across background color changes', async () => {
    viewerMocks.scene = new Mesh(new BoxGeometry(1, 12, 1))
    const { rerender } = render(<ModelViewer modelUrl="https://cdn.example.com/vase.glb" ariaLabel="Vase" />)
    const initialDistance = viewerMocks.camera!.position.length()
    expect(initialDistance).toBeLessThan(3.5)
    expect(viewerMocks.controls!.target.length()).toBeCloseTo(0)
    expect(viewerMocks.controls!.update).toHaveBeenCalled()
    viewerMocks.camera!.position.multiplyScalar(0.75)
    const userDistance = viewerMocks.camera!.position.length()
    await userEvent.click(screen.getByRole('button', { name: 'Change background color' }))
    expect(viewerMocks.camera!.position.length()).toBeCloseTo(userDistance)
    viewerMocks.size = { width: 300, height: 500 }
    rerender(<ModelViewer modelUrl="https://cdn.example.com/vase.glb" ariaLabel="Vase" />)
    const mobileDistance = viewerMocks.camera!.position.length()
    expect(mobileDistance).toBeGreaterThan(initialDistance)
    expect(viewerMocks.invalidate).toHaveBeenCalled()
    viewerMocks.camera!.position.multiplyScalar(0.5)
    rerender(<ModelViewer modelUrl="https://cdn.example.com/another-vase.glb" ariaLabel="Another vase" />)
    expect(viewerMocks.camera!.position.length()).toBeCloseTo(mobileDistance)
  })

  it('mounts a canvas region for a safe preview model URL', () => {
    render(
      <ModelViewer
        modelUrl="https://cdn.example.com/preview.glb"
        ariaLabel="Interactive 3D preview of Demo Asset"
      />,
    )

    expect(
      screen.getByRole('group', { name: /interactive 3d preview of demo asset/i }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('r3f-canvas')).toHaveAttribute('data-dpr', '1.25')
    expect(screen.getByTestId('r3f-canvas')).toHaveAttribute('data-frameloop', 'always')
    expect(viewerMocks.renderScene!.background).toBeNull()
  })

  it('uses the toolbar to control the camera and viewer fullscreen', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <div className="product-detail-stage__viewer">
        <ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Product preview" />
      </div>,
    )
    const requestFullscreen = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(container.firstElementChild, 'requestFullscreen', { value: requestFullscreen })

    await user.click(screen.getByRole('button', { name: 'Reset' }))
    await user.click(screen.getByRole('button', { name: 'Zoom In' }))
    await user.click(screen.getByRole('button', { name: 'Zoom Out' }))
    await user.click(screen.getByRole('button', { name: 'Fullscreen' }))

    expect(viewerMocks.toolbarControls.reset).toHaveBeenCalledOnce()
    expect(viewerMocks.toolbarControls.dollyIn).toHaveBeenCalledWith(0.8)
    expect(viewerMocks.toolbarControls.dollyOut).toHaveBeenCalledWith(0.8)
    expect(requestFullscreen).toHaveBeenCalledOnce()
  })

  it('switches HDRI illumination independently from the background', async () => {
    viewerMocks.scene = new Mesh(new BoxGeometry(1, 2, 1))
    const { container } = render(<ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Preview" />)

    expect(container.querySelectorAll('ambientlight')).toHaveLength(1)
    const lights = container.querySelectorAll('directionallight')
    expect(lights).toHaveLength(2)
    expect(Number(lights[1].getAttribute('intensity'))).toBeCloseTo(0.832)
    const [rightX, rightY, rightZ] = (lights[1].getAttribute('position') ?? '').split(',').map(Number)
    expect(rightX + rightZ).toBeGreaterThan(0)
    expect(rightY).toBeGreaterThan(4)
    const keyLight = () => container.querySelector('directionallight')
    expect(Number(keyLight()?.getAttribute('intensity'))).toBeCloseTo(0.832)
    expect(keyLight()).toHaveAttribute('shadow-normalbias', '0.002')
    expect(Number(keyLight()?.getAttribute('shadow-camera-right'))).toBeGreaterThan(0)
    expect(Number(keyLight()?.getAttribute('shadow-camera-right'))).toBeLessThan(1.7)
    const environment = () => screen.getByTestId('viewer-environment')
    expect(environment()).toHaveAttribute('data-files', '/hdri/small-studio-09.hdr')
    expect(environment()).toHaveAttribute('data-background', 'false')
    expect(viewerMocks.renderer.toneMappingExposure).toBeCloseTo(0.9 * 2 ** 0.7)
    expect(container.querySelector('rectarealight')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Brown Studio' }))
    expect(container.querySelectorAll('directionallight')).toHaveLength(1)
    const fills = container.querySelectorAll('rectarealight')
    expect(fills).toHaveLength(2)
    expect(Number(fills[1].getAttribute('intensity'))).toBeLessThan(Number(fills[0].getAttribute('intensity')))
    for (const fill of fills) {
      expect(Number(fill.getAttribute('position')?.split(',')[1])).toBeLessThan(0)
    }
    expect(environment()).toHaveAttribute('data-background', 'false')
    expect(keyLight()).toHaveAttribute('shadow-bias', '-0.0002')
    expect(Number(keyLight()?.getAttribute('intensity'))).toBeCloseTo(0.936)
    expect(keyLight()).toHaveAttribute('shadow-normalbias', '0.002')
    expect(Number(keyLight()?.getAttribute('shadow-camera-right'))).toBeGreaterThan(0)
    expect(Number(keyLight()?.getAttribute('shadow-camera-right'))).toBeLessThan(1.7)
    expect(environment()).toHaveAttribute('data-files', '/hdri/brown-studio.hdr')
    expect(screen.getByRole('button', { name: 'Brown Studio' })).toHaveAttribute('aria-pressed', 'true')
    expect(viewerMocks.renderer.toneMappingExposure).toBeCloseTo(2 ** 0.7)

    const colorButton = screen.getByRole('button', { name: 'Change background color' })
    const canvas = screen.getByTestId('r3f-canvas')
    await userEvent.click(colorButton)
    expect(canvas.style.backgroundImage).toMatch(
      /radial-gradient\(.*rgb\(104, 104, 104\) 0%.*rgb\(85, 85, 85\) 55%.*rgb\(60, 60, 60\) 100%/,
    )
    await userEvent.click(colorButton)
    expect(canvas.style.backgroundImage).toMatch(
      /radial-gradient\(.*rgb\(51, 60, 77\) 0%.*rgb\(32, 38, 51\) 55%.*rgb\(17, 21, 30\) 100%/,
    )
    await userEvent.click(colorButton)
    expect(canvas.style.backgroundImage).toBe('')
  })

  it('lights the Custom HDRI studio from the viewer side, in front, with a large soft sun', async () => {
    viewerMocks.scene = new Mesh(new BoxGeometry(1, 2, 1))
    const { container } = render(<ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Preview" />)
    await userEvent.click(screen.getByRole('button', { name: 'Custom HDRI' }))

    const environment = screen.getByTestId('viewer-environment')
    expect(environment).toHaveAttribute('data-files', '/hdri/custom-hdri.hdr')
    expect(environment).toHaveAttribute('data-background', 'true')
    expect(viewerMocks.renderer.toneMappingExposure).toBeCloseTo(0.9)

    // Only this preset shows its HDRI as the backdrop, and picking a viewer background colour hides it.
    await userEvent.click(screen.getByRole('button', { name: 'Change background color' }))
    expect(screen.getByTestId('viewer-environment')).toHaveAttribute('data-background', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Small Studio 09' }))
    expect(screen.getByTestId('viewer-environment')).toHaveAttribute('data-background', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Custom HDRI' }))

    const keyLight = container.querySelector('directionallight')
    expect(keyLight).toHaveAttribute('shadow-radius', '6')
    expect(Number(keyLight?.getAttribute('intensity'))).toBeGreaterThan(0)
    const [x, y, z] = String(keyLight?.getAttribute('position')).split(',').map(Number)
    expect(Math.atan2(x, z)).toBeCloseTo(Math.atan2(-1, 1))
    expect(y).toBeGreaterThan(0)
    expect(y).toBeLessThan(Math.hypot(x, z))
  })

  it('keeps the Custom HDRI lighting fixed during orbit and rotates it only while Alt is held during a drag', async () => {
    viewerMocks.scene = new Mesh(new BoxGeometry(1, 2, 1))
    const { container } = render(<ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Preview" />)
    Object.defineProperty(container.querySelector('group')!, 'scale', { value: { setScalar: vi.fn() }, configurable: true })
    vi.mocked(useFrame).mockClear()
    await userEvent.click(screen.getByRole('button', { name: 'Custom HDRI' }))

    const surface = container.querySelector<HTMLElement>('.model-viewer__surface')!
    Object.defineProperty(surface, 'clientWidth', { value: 1000, configurable: true })
    surface.setPointerCapture = vi.fn()
    const initialYaw = -Math.PI / 4
    const expectLightingYaw = (yaw: number) => {
      const environment = screen.getByTestId('viewer-environment')
      expect(Number(environment.getAttribute('data-environment-yaw'))).toBeCloseTo(yaw)
      expect(Number(environment.getAttribute('data-background-yaw'))).toBeCloseTo(yaw)
      const position = container.querySelector('directionallight')?.getAttribute('position') ?? ''
      const [x, , z] = position.split(',').map(Number)
      expect(Math.atan2(x, z)).toBeCloseTo(yaw)
    }
    const orbit = () => {
      viewerMocks.camera!.position.set(2, 1, -2)
      const scene = viewerMocks.renderScene!
      const frameState = { scene, camera: viewerMocks.camera, controls: viewerMocks.controls }
      const rotation = scene.environmentRotation.clone()
      const backgroundRotation = scene.backgroundRotation.clone()
      act(() => {
        for (const [callback] of vi.mocked(useFrame).mock.calls) callback(frameState as never, 0.016, undefined)
      })
      expect(scene.environmentRotation.equals(rotation)).toBe(true)
      expect(scene.backgroundRotation.equals(backgroundRotation)).toBe(true)
    }

    fireEvent.pointerDown(surface, { button: 0, pointerId: 1, clientX: 100 })
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 350 })
    fireEvent.pointerUp(surface, { pointerId: 1 })
    orbit()
    expectLightingYaw(initialYaw)

    fireEvent.pointerDown(surface, { altKey: true, button: 0, pointerId: 1, clientX: 100 })
    fireEvent.pointerMove(surface, { altKey: true, pointerId: 1, clientX: 350 })
    expectLightingYaw(initialYaw + Math.PI / 2)
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 450 })
    fireEvent.pointerUp(surface, { pointerId: 1 })
    orbit()
    expectLightingYaw(initialYaw + Math.PI / 2)
  })

  it('starts Custom HDRI with its own brightness instead of the shared defaults', async () => {
    viewerMocks.scene = new Mesh(new BoxGeometry(1, 2, 1))
    render(<ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Preview" />)
    await userEvent.click(screen.getByRole('button', { name: 'Light Controls' }))
    const slider = (name: string) => screen.getByRole('slider', { name })
    // Shared defaults for the other presets.
    expect(slider('Brightness')).toHaveValue('4')
    expect(slider('Contrast')).toHaveValue('-45')

    await userEvent.click(screen.getByRole('button', { name: 'Custom HDRI' }))
    expect(slider('Brightness')).toHaveValue('3')
    expect(slider('Contrast')).toHaveValue('0')
    expect(slider('Exposure')).toHaveValue('-0.7')
    expect(slider('Highlights')).toHaveValue('0')
    expect(slider('Shadows')).toHaveValue('0')
    expect(slider('Saturation')).toHaveValue('0')
    expect(slider('Sharpness')).toHaveValue('0')

    // Reset goes back to this preset's own starting point.
    fireEvent.change(slider('Contrast'), { target: { value: '20' } })
    await userEvent.click(screen.getByRole('button', { name: 'Reset adjustments' }))
    expect(slider('Contrast')).toHaveValue('0')
    expect(slider('Brightness')).toHaveValue('3')

    // Leaving it restores the shared defaults; moving between ordinary presets keeps the visitor's sliders.
    await userEvent.click(screen.getByRole('button', { name: 'Small Studio 09' }))
    expect(slider('Brightness')).toHaveValue('4')
    expect(slider('Contrast')).toHaveValue('-45')
    expect(slider('Saturation')).toHaveValue('-4')
    expect(slider('Sharpness')).toHaveValue('20')
    fireEvent.change(slider('Contrast'), { target: { value: '-10' } })
    await userEvent.click(screen.getByRole('button', { name: 'Small Studio 08' }))
    expect(slider('Contrast')).toHaveValue('-10')
  })

  it('opens HDRI sliders, changes light intensity and restores defaults', async () => {
    render(<ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Preview" />)
    expect(screen.queryByRole('slider', { name: 'Brightness' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Light Controls' }))
    const brightness = screen.getByRole('slider', { name: 'Brightness' })
    expect(brightness).toHaveValue('4')
    fireEvent.change(brightness, { target: { value: '50' } })
    expect(Number(screen.getByTestId('viewer-environment').getAttribute('data-intensity'))).toBeCloseTo(1.2)
    fireEvent.change(brightness, { target: { value: '-50' } })
    expect(Number(screen.getByTestId('viewer-environment').getAttribute('data-intensity'))).toBeCloseTo(0.4)
    const canvas = screen.getByTestId('r3f-canvas')
    const toneTable = () => canvas.parentElement?.querySelector('feFuncR')?.getAttribute('tableValues')
    const defaultToneTable = toneTable()
    const extraSliders = [
      ['Contrast', '-25', '-45'],
      ['Exposure', '-1.5', '-0.4'],
      ['Saturation', '-25', '-4'],
      ['Highlights', '-30', '-24'],
      ['Shadows', '-30', '-69'],
      ['Gamma', '-0.25', '-0.1'],
      ['Sharpness', '-50', '20'],
    ]
    for (const [name, value, defaultValue] of extraSliders) {
      const slider = screen.getByRole('slider', { name })
      expect(slider).toHaveValue(defaultValue)
      const previousTone = toneTable()
      fireEvent.change(slider, { target: { value } })
      expect(slider).toHaveValue(value)
      if (['Contrast', 'Highlights', 'Shadows', 'Gamma'].includes(name)) {
        expect(toneTable()).toBeDefined()
        expect(toneTable()).not.toBe(previousTone)
      }
    }
    expect(viewerMocks.renderer.toneMappingExposure).toBeCloseTo(0.9 * 2 ** -0.4)
    expect(canvas.style.getPropertyValue('--viewer-image-filter')).toMatch(/^saturate\(75%\) url\(/)
    const kernel = () => canvas.parentElement?.querySelector('feConvolveMatrix')
    expect(kernel()).toHaveAttribute('kernelMatrix', '0 0.1 0 0.1 0.6 0.1 0 0.1 0')
    fireEvent.change(screen.getByRole('slider', { name: 'Sharpness' }), { target: { value: '100' } })
    expect(kernel()).toHaveAttribute('kernelMatrix', '0 -0.25 0 -0.25 2 -0.25 0 -0.25 0')
    await userEvent.click(screen.getByRole('button', { name: 'Reset adjustments' }))
    expect(canvas.style.getPropertyValue('--viewer-image-filter')).toMatch(/^saturate\(96%\) url\(/)
    expect(kernel()).toHaveAttribute('kernelMatrix', '0 -0.05 0 -0.05 1.2 -0.05 0 -0.05 0')
    expect(toneTable()).toBe(defaultToneTable)
    expect(viewerMocks.renderer.toneMappingExposure).toBeCloseTo(0.9 * 2 ** 0.7)
    expect(brightness).toHaveValue('4')
    for (const [name, , defaultValue] of extraSliders) {
      expect(screen.getByRole('slider', { name })).toHaveValue(defaultValue)
    }
    expect(Number(screen.getByTestId('viewer-environment').getAttribute('data-intensity'))).toBeCloseTo(0.832)
  })

  it('shows a no-model fallback when the URL is missing or unsafe', () => {
    const { rerender } = render(
      <ModelViewer modelUrl="" ariaLabel="Interactive 3D preview of Demo Asset" />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/3d preview unavailable/i)
    expect(screen.queryByTestId('r3f-canvas')).not.toBeInTheDocument()

    rerender(
      <ModelViewer
        modelUrl="https://cdn.example.com/secret.zip"
        ariaLabel="Interactive 3D preview of Demo Asset"
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/no valid preview model/i)
    expect(screen.queryByTestId('r3f-canvas')).not.toBeInTheDocument()
  })

  it('pauses rendering when the viewer is off-screen', () => {
    viewerMocks.visible = false

    render(
      <ModelViewer
        modelUrl="https://cdn.example.com/preview.glb"
        ariaLabel="Interactive 3D preview of Demo Asset"
      />,
    )

    expect(screen.getByTestId('r3f-canvas')).toHaveAttribute('data-frameloop', 'never')
  })

  it('does not dispose shared GLTF resources on unmount', () => {
    const { unmount } = render(
      <ModelViewer
        modelUrl="https://cdn.example.com/preview.glb"
        ariaLabel="Interactive 3D preview of Demo Asset"
      />,
    )

    unmount()

    // clone(true) shares geometries with the useGLTF cache; clearing/disposing on
    // Suspense remounts would leave an empty canvas.
    expect(viewerMocks.clearGltfCache).not.toHaveBeenCalled()
  })

  it('shows WebGL fallback when WebGL is unavailable', () => {
    viewerMocks.webglAvailable = false

    render(
      <ModelViewer
        modelUrl="https://cdn.example.com/preview.glb"
        ariaLabel="Interactive 3D preview of Demo Asset"
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/webgl is unavailable/i)
    expect(screen.queryByTestId('r3f-canvas')).not.toBeInTheDocument()
  })
})
