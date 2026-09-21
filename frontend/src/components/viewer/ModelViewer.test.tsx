import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Object3D } from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const viewerMocks = vi.hoisted(() => {
  return {
    scene: null as import('three').Object3D | null,
    clearGltfCache: vi.fn(),
    visible: true,
    webglAvailable: true,
    pixelRatio: 1.25,
  }
})

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
  useThree: () => ({ scene: new Object3D() }),
}))

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Environment: ({
    files,
    backgroundBlurriness,
    children,
  }: {
    files?: string
    backgroundBlurriness?: number
    children?: import('react').ReactNode
  }) => (
    <div
      data-testid="viewer-environment"
      data-files={files ?? ''}
      data-background-blurriness={backgroundBlurriness ?? ''}
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
    viewerMocks.scene = new Object3D()
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
    expect(screen.getByRole('button', { name: 'Wireframe' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('renders environment controls and defaults to Studio HDRI', async () => {
    render(
      <ModelViewer
        modelUrl="https://cdn.example.com/preview.glb"
        ariaLabel="Interactive 3D preview of Demo Asset"
      />,
    )

    expect(screen.getByRole('radio', { name: 'Studio' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Natural' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByRole('radio', { name: 'Sky' })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByTestId('viewer-environment')).toHaveAttribute(
        'data-files',
        '/hdri/studio_small_08_1k.hdr',
      )
      // Studio uses HDRI for lighting only (solid white backdrop), so blurriness is 0.
      expect(screen.getByTestId('viewer-environment')).toHaveAttribute(
        'data-background-blurriness',
        '0',
      )
    })
  })

  it('switches HDRI environment when user selects a different option', async () => {
    const user = userEvent.setup()
    render(
      <ModelViewer
        modelUrl="https://cdn.example.com/preview.glb"
        ariaLabel="Interactive 3D preview of Demo Asset"
      />,
    )

    await user.click(screen.getByRole('radio', { name: 'Natural' }))

    expect(screen.getByRole('radio', { name: 'Natural' })).toHaveAttribute('aria-checked', 'true')
    await waitFor(() => {
      expect(screen.getByTestId('viewer-environment')).toHaveAttribute(
        'data-files',
        '/hdri/forest_slope_1k.hdr',
      )
    })
  })

  it('shows a no-model fallback when the URL is missing or unsafe', () => {
    const { rerender } = render(
      <ModelViewer modelUrl="" ariaLabel="Interactive 3D preview of Demo Asset" />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/3d preview unavailable/i)
    expect(screen.queryByTestId('r3f-canvas')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Wireframe' })).not.toBeInTheDocument()

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
    expect(screen.queryByRole('button', { name: 'Wireframe' })).not.toBeInTheDocument()
  })

  it('toggles the Wireframe button pressed state', async () => {
    const user = userEvent.setup()
    render(
      <ModelViewer
        modelUrl="https://cdn.example.com/preview.glb"
        ariaLabel="Interactive 3D preview of Demo Asset"
      />,
    )

    const button = screen.getByRole('button', { name: 'Wireframe' })
    expect(button).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('radio', { name: 'Natural' }))
    await user.click(button)

    expect(button).toHaveAttribute('aria-pressed', 'true')
  })
})
