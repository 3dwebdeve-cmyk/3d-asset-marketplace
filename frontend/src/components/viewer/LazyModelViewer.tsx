import { lazy, Suspense } from 'react'

import type { ModelViewerProps } from './ModelViewer'

const ModelViewer = lazy(() => import('./ModelViewer'))

function LazyModelViewerShell({ ariaLabel }: { ariaLabel: string }) {
  return (
    <div className="model-viewer model-viewer--loading" role="status" aria-live="polite">
      <p className="model-viewer__fallback-title">Loading 3D viewer</p>
      <p className="model-viewer__fallback-body">
        Loading interactive preview for {ariaLabel}…
      </p>
    </div>
  )
}

/**
 * Code-split entry for the R3F viewer so Three.js stays out of the main bundle
 * until a product with preview_model mounts this component.
 */
export function LazyModelViewer(props: ModelViewerProps) {
  return (
    <Suspense fallback={<LazyModelViewerShell ariaLabel={props.ariaLabel} />}>
      <ModelViewer {...props} />
    </Suspense>
  )
}
