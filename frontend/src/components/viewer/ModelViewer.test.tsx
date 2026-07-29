import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const viewerMocks = vi.hoisted(() => ({
  clearGltfCache: vi.fn(),
  clonedScene: { traverse: vi.fn() },
  disposeSceneResources: vi.fn(),
  visible: true,
  webglAvailable: true,
  pixelRatio: 1.25,
}))

vi.mock('@react-three/fiber', () => ({
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
}))

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  useGLTF: Object.assign(
    () => ({
      scene: {
        clone: () => viewerMocks.clonedScene,
      },
    }),
    { clear: viewerMocks.clearGltfCache },
  ),
  useProgress: () => ({ active: false, progress: 100, loaded: 1, total: 1 }),
}))

vi.mock('./disposeSceneResources', () => ({
  disposeSceneResources: viewerMocks.disposeSceneResources,
}))

vi.mock('./isWebGLAvailable', () => ({
  isWebGLAvailable: () => viewerMocks.webglAvailable,
}))

vi.mock('./useAdaptivePixelRatio', () => ({
  useAdaptivePixelRatio: () => viewerMocks.pixelRatio,
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
    viewerMocks.visible = true
    viewerMocks.webglAvailable = true
    viewerMocks.pixelRatio = 1.25
  })

  it('mounts a canvas region for a safe preview model URL', () => {
    render(
      <ModelViewer
        modelUrl="https://cdn.example.com/preview.glb"
        ariaLabel="Interactive 3D preview of Demo Asset"
      />,
    )

    expect(
      screen.getByRole('img', { name: /interactive 3d preview of demo asset/i }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('r3f-canvas')).toHaveAttribute('data-dpr', '1.25')
    expect(screen.getByTestId('r3f-canvas')).toHaveAttribute('data-frameloop', 'always')
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

  it('disposes scene resources and clears GLTF cache on unmount', () => {
    const { unmount } = render(
      <ModelViewer
        modelUrl="https://cdn.example.com/preview.glb"
        ariaLabel="Interactive 3D preview of Demo Asset"
      />,
    )

    unmount()

    expect(viewerMocks.disposeSceneResources).toHaveBeenCalledWith(viewerMocks.clonedScene)
    expect(viewerMocks.clearGltfCache).toHaveBeenCalledWith('https://cdn.example.com/preview.glb')
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
