import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Object3D, Scene, Texture } from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const viewerMocks = vi.hoisted(() => {
  return {
    scene: null as import('three').Object3D | null,
    renderScene: null as import('three').Scene | null,
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
  useThree: (selector?: (state: { scene: import('three').Scene }) => unknown) => {
    const state = { scene: viewerMocks.renderScene ?? new Scene() }
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
    viewerMocks.scene = new Object3D()
    viewerMocks.renderScene = new Scene()
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
    expect(viewerMocks.renderScene!.background).toMatchObject({ isColor: true })
    expect(viewerMocks.renderScene!.background).toHaveProperty('getHexString')
    expect((viewerMocks.renderScene!.background as import('three').Color).getHexString()).toBe(
      'f3f4f6',
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
      // Studio uses HDRI for lighting only (solid light-grey backdrop), so blurriness is 0.
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

  it('removes studio lights when Natural lighting is active and restores them on return', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Product preview" />,
    )
    await screen.findByTestId('viewer-environment')
    expect(container.querySelectorAll('directionallight')).toHaveLength(3)

    await user.click(screen.getByRole('radio', { name: 'Natural' }))
    await waitFor(() => {
      expect(screen.getByTestId('viewer-environment')).toHaveAttribute(
        'data-files', '/hdri/forest_slope_1k.hdr',
      )
    })
    expect(container.querySelectorAll('directionallight')).toHaveLength(0)
    expect(container.querySelectorAll('ambientlight, hemispherelight')).toHaveLength(0)
    expect(screen.getByTestId('viewer-environment')).toHaveAttribute('data-background', 'true')

    await user.click(screen.getByRole('radio', { name: 'Studio' }))
    await waitFor(() => {
      expect(screen.getByTestId('viewer-environment')).toHaveAttribute(
        'data-files', '/hdri/studio_small_08_1k.hdr',
      )
    })
    expect(container.querySelectorAll('directionallight')).toHaveLength(3)
    expect(screen.getByTestId('viewer-environment')).toHaveAttribute('data-background', 'false')
  })

  it('replaces a retained Natural HDRI background when returning to Studio', async () => {
    const user = userEvent.setup()
    render(<ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Product preview" />)
    await screen.findByTestId('viewer-environment')

    await user.click(screen.getByRole('radio', { name: 'Natural' }))
    await waitFor(() => {
      expect(screen.getByTestId('viewer-environment')).toHaveAttribute('data-background', 'true')
    })

    viewerMocks.renderScene!.background = new Texture()
    await user.click(screen.getByRole('radio', { name: 'Studio' }))

    await waitFor(() => {
      expect(viewerMocks.renderScene!.background).toMatchObject({ isColor: true })
      expect(
        (viewerMocks.renderScene!.background as import('three').Color).getHexString(),
      ).toBe('f3f4f6')
    })
  })

  it('clears the previous HDRI while the selected environment is pending', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Product preview" />,
    )
    await screen.findByTestId('viewer-environment')
    let resolveNatural!: (response: { ok: boolean }) => void
    vi.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => {
      resolveNatural = resolve as typeof resolveNatural
    }))

    await user.click(screen.getByRole('radio', { name: 'Natural' }))
    expect(screen.queryByTestId('viewer-environment')).not.toBeInTheDocument()
    expect(container.querySelectorAll('directionallight')).toHaveLength(0)
    expect(container.querySelectorAll('ambientlight, hemispherelight')).toHaveLength(2)
    expect(screen.getByTestId('r3f-canvas').querySelector('primitive')).toBeInTheDocument()

    await act(async () => resolveNatural({ ok: true }))
    expect(screen.getByTestId('viewer-environment')).toHaveAttribute(
      'data-files', '/hdri/forest_slope_1k.hdr',
    )
    expect(container.querySelectorAll('ambientlight, hemispherelight')).toHaveLength(0)
  })

  it('ignores a late response from a previously selected environment', async () => {
    const user = userEvent.setup()
    let resolveStudio!: (response: { ok: boolean }) => void
    vi.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => {
      resolveStudio = resolve as typeof resolveStudio
    }))
    render(<ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Product preview" />)
    await user.click(screen.getByRole('radio', { name: 'Natural' }))
    await screen.findByTestId('viewer-environment')

    await act(async () => resolveStudio({ ok: true }))
    expect(screen.getByTestId('viewer-environment')).toHaveAttribute(
      'data-files', '/hdri/forest_slope_1k.hdr',
    )
    expect(screen.getByTestId('viewer-environment')).toHaveAttribute('data-background', 'true')
  })

  it('uses only neutral fallback lights if Natural HDRI is unavailable', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ModelViewer modelUrl="https://cdn.example.com/preview.glb" ariaLabel="Product preview" />,
    )
    await screen.findByTestId('viewer-environment')
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response)
    await user.click(screen.getByRole('radio', { name: 'Natural' }))

    expect(await screen.findByText(/Natural HDRI is unavailable/)).toBeInTheDocument()
    expect(screen.queryByTestId('viewer-environment')).not.toBeInTheDocument()
    expect(container.querySelectorAll('directionallight')).toHaveLength(0)
    expect(container.querySelectorAll('ambientlight, hemispherelight')).toHaveLength(2)
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
