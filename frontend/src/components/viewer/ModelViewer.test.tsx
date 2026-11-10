import { act, render, screen, waitFor } from '@testing-library/react'
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
  }: {
    children?: import('react').ReactNode
    frameloop?: string
    dpr?: number
  }) => (
    <div data-testid="r3f-canvas" data-frameloop={frameloop} data-dpr={dpr}>
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
  OrbitControls: () => null,
  Environment: ({
    files,
    backgroundBlurriness,
    background,
    environmentIntensity,
    children,
  }: {
    files?: string
    backgroundBlurriness?: number
    background?: boolean
    environmentIntensity?: number
    children?: import('react').ReactNode
  }) => (
    <div
      data-testid="viewer-environment"
      data-files={files ?? ''}
      data-background-blurriness={backgroundBlurriness ?? ''}
      data-background={String(background)}
      data-intensity={environmentIntensity}
    >
      {children}
    </div>
  ),
  Lightformer: () => null,
  ContactShadows: () => null,
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
  useAdaptiveShadowMapSize: () => 1024,
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
      }),
    )
  })

  it('smoothly grows the model to its fitted size after loading', () => {
    const { container } = render(<ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Preview" />)
    const group = container.querySelector('group')!
    const setScalar = vi.fn()
    Object.defineProperty(group, 'scale', { value: { setScalar }, configurable: true })
    const frame = vi.mocked(useFrame).mock.calls.at(-1)![0]
    act(() => { for (let i = 0; i < 15; i += 1) frame({} as never, 0.05, undefined) })
    expect(setScalar.mock.calls[0][0]).toBeGreaterThan(0.85)
    expect(setScalar.mock.calls.at(-1)![0]).toBeCloseTo(1)
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

  it('fits loaded models on entry and resize while preserving zoom on rerender', async () => {
    viewerMocks.scene = new Mesh(new BoxGeometry(1, 12, 1))
    const { rerender } = render(<ModelViewer modelUrl="https://cdn.example.com/vase.glb" ariaLabel="Vase" />)
    await screen.findByTestId('viewer-environment')
    const initialDistance = viewerMocks.camera!.position.length()
    expect(initialDistance).toBeGreaterThan(3.5)
    expect(viewerMocks.controls!.target.length()).toBeCloseTo(0)
    expect(viewerMocks.controls!.update).toHaveBeenCalled()
    // An ordinary rerender must preserve the user's view.
    viewerMocks.camera!.position.multiplyScalar(0.75)
    const userDistance = viewerMocks.camera!.position.length()
    rerender(<ModelViewer modelUrl="https://cdn.example.com/vase.glb" ariaLabel="Vase" />)
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
    expect(viewerMocks.renderScene!.background).toMatchObject({ isColor: true })
    expect(viewerMocks.renderScene!.background).toHaveProperty('getHexString')
    expect((viewerMocks.renderScene!.background as import('three').Color).getHexString()).toBe(
      'f2f2f2',
    )
  })

  it('loads the new HDRI without a lighting selector', async () => {
    render(
      <ModelViewer
        modelUrl="https://cdn.example.com/preview.glb"
        ariaLabel="Interactive 3D preview of Demo Asset"
      />,
    )

    expect(screen.queryByRole('radiogroup', { name: 'Lighting setup' })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByTestId('viewer-environment')).toHaveAttribute(
        'data-files',
        '/hdri/studio_kominka_01_1k.exr',
      )
      // Studio keeps the EXR's dark areas out of the neutral backdrop; lighting stays active.
      expect(screen.getByTestId('viewer-environment')).toHaveAttribute('data-background', 'false')
      expect(screen.getByTestId('viewer-environment')).toHaveAttribute('data-intensity', '1')
      expect(screen.getByTestId('viewer-environment')).toHaveAttribute(
        'data-background-blurriness',
        '0',
      )
    })
  })

  it('keeps the model visible if the HDRI cannot be loaded', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response)
    const { container } = render(<ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Product preview" />)
    expect(await screen.findByText(/Studio HDRI is unavailable/)).toBeInTheDocument()
    expect(screen.queryByTestId('viewer-environment')).not.toBeInTheDocument()
    expect(container.querySelectorAll('directionallight')).toHaveLength(3)
    expect(screen.getByTestId('r3f-canvas').querySelector('primitive')).toBeInTheDocument()
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
