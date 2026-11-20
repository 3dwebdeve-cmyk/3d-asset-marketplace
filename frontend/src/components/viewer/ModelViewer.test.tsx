import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useImperativeHandle, type Ref } from 'react'
import { BoxGeometry, Mesh, Object3D, PerspectiveCamera, Scene, Vector3 } from 'three'
import { useFrame } from '@react-three/fiber'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const viewerMocks = vi.hoisted(() => {
  return {
    scene: null as import('three').Object3D | null,
    renderScene: null as import('three').Scene | null,
    camera: null as import('three').PerspectiveCamera | null,
    size: { width: 900, height: 450 },
    controls: null as { target: import('three').Vector3; update: () => void; saveState: () => void } | null,
    invalidate: vi.fn(),
    toolbarControls: { reset: vi.fn(), dollyIn: vi.fn(), dollyOut: vi.fn() },
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
    camera: import('three').PerspectiveCamera
    size: { width: number; height: number }
    controls: typeof viewerMocks.controls
    invalidate: () => void
  }) => unknown) => {
    const state = {
      scene: viewerMocks.renderScene ?? new Scene(),
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
  Environment: ({ files, background }: { files: string; background: boolean }) => (
    <div data-testid="viewer-environment" data-files={files} data-background={background} />
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
    viewerMocks.camera = new PerspectiveCamera(42, 2, 0.1, 200)
    viewerMocks.camera.position.set(0, 0.9, 2.3)
    viewerMocks.size = { width: 900, height: 450 }
    viewerMocks.controls = { target: new Vector3(3, 4, 5), update: vi.fn(), saveState: vi.fn() }
    viewerMocks.visible = true
    viewerMocks.webglAvailable = true
    viewerMocks.pixelRatio = 1.25
  })

  it('starts a half orbit near the end of the opening zoom', () => {
    viewerMocks.scene = new Mesh(new BoxGeometry(1, 2, 1))
    const { container } = render(<ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Preview" />)
    const group = container.querySelector('group')!
    const setScalar = vi.fn()
    Object.defineProperty(group, 'scale', { value: { setScalar }, configurable: true })
    const frame = vi.mocked(useFrame).mock.calls.at(-1)![0]
    const center = viewerMocks.controls!.target
    const openingOffset = viewerMocks.camera!.position.clone().sub(center)
    expect(group).toHaveAttribute('scale', '0.35')
    expect(screen.queryByTestId('viewer-shadow')).not.toBeInTheDocument()
    act(() => { for (let i = 0; i < 15; i += 1) frame({} as never, 0.05, undefined) })
    expect(setScalar.mock.calls[0][0]).toBeGreaterThan(0.35)
    expect(setScalar.mock.calls.at(-1)![0]).toBeLessThan(1)
    expect(viewerMocks.camera!.position.clone().sub(center).distanceTo(openingOffset)).toBeCloseTo(0)
    act(() => { for (let i = 0; i < 16; i += 1) frame({} as never, 0.05, undefined) })
    expect(setScalar.mock.calls.at(-1)![0]).toBeCloseTo(1)
    expect(screen.getByTestId('viewer-shadow')).toBeInTheDocument()
    expect(viewerMocks.camera!.position.clone().sub(center).distanceTo(openingOffset)).toBeGreaterThan(0)
    act(() => { for (let i = 0; i < 30; i += 1) frame({} as never, 0.05, undefined) })
    const offset = viewerMocks.camera!.position.clone().sub(center)
    expect(offset.x).toBeCloseTo(-openingOffset.x)
    expect(offset.y).toBeCloseTo(openingOffset.y)
    expect(offset.z).toBeCloseTo(-openingOffset.z)
  })

  it('stops the opening orbit when Reset is clicked', async () => {
    viewerMocks.scene = new Mesh(new BoxGeometry(1, 2, 1))
    const { container } = render(<ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Preview" />)
    Object.defineProperty(container.querySelector('group')!, 'scale', { value: { setScalar: vi.fn() } })
    const frame = vi.mocked(useFrame).mock.calls.at(-1)![0]
    act(() => { for (let i = 0; i < 33; i += 1) frame({} as never, 0.05, undefined) })
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
    const resetPosition = viewerMocks.camera!.position.clone()
    act(() => { for (let i = 0; i < 30; i += 1) frame({} as never, 0.05, undefined) })
    expect(viewerMocks.toolbarControls.reset).toHaveBeenCalledOnce()
    expect(viewerMocks.camera!.position.equals(resetPosition)).toBe(true)
  })

  it('skips the entrance animation when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    try {
      const { container } = render(<ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Preview" />)
      const group = container.querySelector('group')!
      const setScalar = vi.fn()
      Object.defineProperty(group, 'scale', { value: { setScalar }, configurable: true })
      const frame = vi.mocked(useFrame).mock.calls.at(-1)![0]
      act(() => frame({} as never, 0.05, undefined))
      expect(setScalar).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('fits loaded models on entry and resize while keeping user zoom across background color changes', async () => {
    viewerMocks.scene = new Mesh(new BoxGeometry(1, 12, 1))
    const { rerender } = render(<ModelViewer modelUrl="https://cdn.example.com/vase.glb" ariaLabel="Vase" />)
    const initialDistance = viewerMocks.camera!.position.length()
    expect(initialDistance).toBeGreaterThan(3.5)
    expect(viewerMocks.controls!.target.length()).toBeCloseTo(0)
    expect(viewerMocks.controls!.update).toHaveBeenCalled()
    viewerMocks.camera!.position.multiplyScalar(0.75)
    const userDistance = viewerMocks.camera!.position.length()
    await userEvent.click(screen.getByRole('button', { name: 'Change background color' }))
    expect(viewerMocks.camera!.position.length()).toBeCloseTo(userDistance)
    viewerMocks.size = { width: 300, height: 500 }
    rerender(<ModelViewer modelUrl="https://cdn.example.com/vase.glb" ariaLabel="Vase" />)
    expect(viewerMocks.camera!.position.length()).toBeCloseTo(initialDistance)
    expect(viewerMocks.invalidate).toHaveBeenCalled()
    viewerMocks.camera!.position.multiplyScalar(0.5)
    rerender(<ModelViewer modelUrl="https://cdn.example.com/another-vase.glb" ariaLabel="Another vase" />)
    expect(viewerMocks.camera!.position.length()).toBeCloseTo(initialDistance)
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
    expect(container.querySelector('directionallight, hemispherelight')).toBeNull()
    const environment = () => screen.getByTestId('viewer-environment')
    expect(environment()).toHaveAttribute('data-files', '/hdri/small-studio-09.hdr')
    expect(environment()).toHaveAttribute('data-background', 'false')
    expect(screen.getByRole('group', { name: 'Lighting presets' }).querySelectorAll('button')).toHaveLength(4)
    await userEvent.click(screen.getByRole('button', { name: 'Brown Studio' }))
    expect(environment()).toHaveAttribute('data-files', '/hdri/brown-studio.hdr')
    expect(screen.getByRole('button', { name: 'Brown Studio' })).toHaveAttribute('aria-pressed', 'true')

    const colorButton = screen.getByRole('button', { name: 'Change background color' })
    const canvas = screen.getByTestId('r3f-canvas')
    await userEvent.click(colorButton)
    expect(canvas.style.backgroundColor).toBe('rgb(167, 163, 165)')
    expect(canvas.style.backgroundImage).toBe('')
    await userEvent.click(colorButton)
    expect(canvas.style.backgroundColor).toBe('')
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
