import { useQuery } from '@tanstack/react-query'

import { getAdminProductFileCheck } from '../../api/productsApi'
import { Button } from '../../components/ui/Button'
import { getApiErrorMessage } from '../../lib/apiError'
import type { ProductFileCheckEntry } from '../../types/product'

interface ProductFileCheckPanelProps {
  productId: string
  /** Images that did not load in this browser, by label (for example "Image 3"). */
  failedImageLabels: string[]
}

const BUCKET_NAMES: Record<ProductFileCheckEntry['bucket'], string> = {
  public: 'public bucket',
  private: 'private bucket',
  external: 'another website',
  invalid: 'not a valid file path',
}

/**
 * Warns when a file the product uses is not in storage (R2): a render, the thumbnail, the 3D
 * preview or a download. The check runs on the server, so private downloads are covered too,
 * and again whenever the product's files change.
 */
export function ProductFileCheckPanel({ productId, failedImageLabels }: ProductFileCheckPanelProps) {
  const checkQuery = useQuery({
    // Under the product's key, so uploads and deletes on this page check again by themselves.
    queryKey: ['admin', 'products', productId, 'file-check'],
    queryFn: () => getAdminProductFileCheck(productId),
    staleTime: 0,
  })

  const checkAgain = (
    <Button
      type="button"
      variant="secondary"
      className="admin-file-check__button"
      isLoading={checkQuery.isFetching}
      onClick={() => checkQuery.refetch()}
    >
      Check again
    </Button>
  )

  if (checkQuery.isPending) {
    return (
      <p className="admin-file-check admin-file-check--quiet" role="status">
        Checking this product&apos;s files in storage...
      </p>
    )
  }

  if (checkQuery.isError) {
    return (
      <div className="admin-file-check admin-file-check--warning" role="alert">
        <p className="admin-file-check__title">The product&apos;s files could not be checked</p>
        <p className="admin-file-check__hint">
          {getApiErrorMessage(checkQuery.error, 'Storage or the website did not answer. Try again in a minute.')}
        </p>
        {checkAgain}
      </div>
    )
  }

  const { files, total } = checkQuery.data
  const missing = files.filter((file) => file.status === 'missing')
  const unknown = files.filter((file) => file.status === 'unknown')

  if (!missing.length && !failedImageLabels.length) {
    return (
      <div className="admin-file-check admin-file-check--quiet" role="status">
        <p>
          {unknown.length
            ? `Storage did not answer for ${unknown.length} of ${total} file(s); the others are there.`
            : `All ${total} file(s) this product uses are in storage.`}
        </p>
        {unknown.length ? checkAgain : null}
      </div>
    )
  }

  return (
    <section className="admin-file-check admin-file-check--warning" role="alert" aria-labelledby="file-check-title">
      <h2 id="file-check-title" className="admin-file-check__title">
        {missing.length
          ? `${missing.length} file(s) missing in storage`
          : `${failedImageLabels.length} image(s) did not load`}
      </h2>
      {missing.length ? (
        <>
          <ul className="admin-file-check__list">
            {missing.map((file) => (
              <li key={`${file.role}:${file.key}`}>
                <strong>{file.label}</strong>
                <code>{file.key}</code>
                <span className="admin-file-check__bucket">{BUCKET_NAMES[file.bucket]}</span>
              </li>
            ))}
          </ul>
          <p className="admin-file-check__hint">
            Customers cannot see or download these. Upload the model again with the Model Uploader,
            or replace the file under &quot;Images and model files&quot; below.
          </p>
        </>
      ) : null}
      {failedImageLabels.length ? (
        <p className="admin-file-check__hint">
          Did not load in this browser: {failedImageLabels.join(', ')}. The file may be damaged or
          blocked; use Open in the image list below to check it.
        </p>
      ) : null}
      {unknown.length ? (
        <p className="admin-file-check__hint">Storage did not answer for {unknown.length} more file(s).</p>
      ) : null}
      {checkAgain}
    </section>
  )
}
