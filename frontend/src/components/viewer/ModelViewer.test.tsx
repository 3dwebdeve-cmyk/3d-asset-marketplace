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
  Environment: ({ map, background, environmentIntensity }: {
    map: { name: string }; background: boolean; environmentIntensity: number
  }) => (
    <div data-testid="viewer-environment" data-files={map.name} data-background={background} data-intensity={environmentIntensity} />
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
    const { container } = render(<ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Preview" />)

    expect(container.querySelectorAll('ambientlight')).toHaveLength(1)
    expect(container.querySelectorAll('directionallight')).toHaveLength(1)
    const environment = () => screen.getByTestId('viewer-environment')
    expect(environment()).toHaveAttribute('data-files', '/hdri/small-studio-09.hdr')
    expect(environment()).toHaveAttribute('data-background', 'false')
    expect(viewerMocks.renderer.toneMappingExposure).toBe(0.9)
    expect(screen.getByRole('group', { name: 'Lighting presets' }).querySelectorAll('button')).toHaveLength(5)
    await userEvent.click(screen.getByRole('button', { name: 'Brown Studio' }))
    expect(environment()).toHaveAttribute('data-files', '/hdri/brown-studio.hdr')
    expect(screen.getByRole('button', { name: 'Brown Studio' })).toHaveAttribute('aria-pressed', 'true')
    expect(viewerMocks.renderer.toneMappingExposure).toBe(1)

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
    expect(canvas.style.backgroundImage).toMatch(
      /radial-gradient\(.*rgb\(78, 84, 89\) 0%.*rgb\(55, 60, 64\) 55%.*rgb\(32, 35, 38\) 100%/,
    )
    await userEvent.click(colorButton)
    expect(canvas.style.backgroundImage).toBe('')
  })

  it('uses a left key, right fill, and upper rear light for Light 111', async () => {
    const { container } = render(<ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Preview" />)
    await userEvent.click(screen.getByRole('button', { name: 'Light Controls' }))
    await userEvent.click(screen.getByRole('button', { name: 'Light 111' }))
    expect(screen.queryByRole('slider', { name: 'Sunlight' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('viewer-environment')).not.toBeInTheDocument()
    expect(container.querySelector('ambientlight, directionallight')).toBeNull()
    const lights = container.querySelectorAll('rectarealight')
    expect(lights).toHaveLength(3)
    const [key, fill, rear] = Array.from(lights, (light) => ({
      position: (light.getAttribute('position') ?? '').split(',').map(Number),
      intensity: Number(light.getAttribute('intensity')),
    }))
    const [x, y, z] = key.position
    expect(x).toBeLessThan(0)
    expect(z).toBeCloseTo(x)
    expect(Math.atan2(y, Math.hypot(x, z)) * 180 / Math.PI).toBeCloseTo(15)
    expect(fill.position[0] + fill.position[2]).toBeGreaterThan(0)
    expect(rear.position[1]).toBeGreaterThan(fill.position[1])
    expect(fill.intensity).toBeLessThan(key.intensity)
    expect(rear.intensity).toBeLessThan(fill.intensity)
    await userEvent.click(screen.getByRole('button', { name: 'Small Studio 09' }))
    expect(screen.getByTestId('viewer-environment')).toBeInTheDocument()
    expect(container.querySelectorAll('ambientlight, directionallight')).toHaveLength(2)
  })

  it('opens HDRI sliders, changes light intensity and restores defaults', async () => {
    render(<ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Preview" />)
    expect(screen.queryByRole('slider', { name: 'Brightness' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Light Controls' }))
    const brightness = screen.getByRole('slider', { name: 'Brightness' })
    expect(brightness).toHaveValue('3')
    expect(screen.getByRole('slider', { name: 'Exposure' })).toHaveValue('-0.7')
    fireEvent.change(brightness, { target: { value: '50' } })
    expect(Number(screen.getByTestId('viewer-environment').getAttribute('data-intensity'))).toBeCloseTo(1.2)
    fireEvent.change(brightness, { target: { value: '-50' } })
    expect(Number(screen.getByTestId('viewer-environment').getAttribute('data-intensity'))).toBeCloseTo(0.4)
    const extraSliders = [
      ['Contrast', '-25'],
      ['Exposure', '-1.5'],
      ['Saturation', '-25'],
      ['Highlights', '-30'],
      ['Shadows', '-30'],
      ['Gamma', '-0.25'],
      ['Sharpness', '-50'],
    ]
    for (const [name, value] of extraSliders) {
      const slider = screen.getByRole('slider', { name })
      fireEvent.change(slider, { target: { value } })
      expect(slider).toHaveValue(value)
    }
    await userEvent.click(screen.getByRole('button', { name: 'Reset adjustments' }))
    expect(brightness).toHaveValue('3')
    for (const [name] of extraSliders) {
      expect(screen.getByRole('slider', { name })).toHaveValue(name === 'Exposure' ? '-0.7' : '0')
    }
    expect(Number(screen.getByTestId('viewer-environment').getAttribute('data-intensity'))).toBeCloseTo(0.824)
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
