import { Link } from 'react-router-dom'

import type { OrderItemDownloadFile } from '../../types/download'
import type { CustomerOrderItem } from '../../types/order'

/** Where a used-up purchase can be bought again (null without a slug). */
function buyAgainPath(item: CustomerOrderItem): string | null {
  if (!item.slug) return null
  if (item.product_type === 'plugin') return `/plugins/${item.slug}`
  if (item.product_type === 'product') return `/products/${item.slug}`
  return null
}

interface OrderItemDownloadsProps {
  item: CustomerOrderItem
  onDownload: (file: OrderItemDownloadFile) => Promise<void>
  downloadingFileId?: string | null
  /** BEM block providing `__download-btn`, `__download-stack` and `__muted` styles. */
  classBlock?: string
  emptyLabel?: string
}

export function OrderItemDownloads({
  item,
  onDownload,
  downloadingFileId = null,
  classBlock = 'invoice-card',
  emptyLabel = 'No files',
}: OrderItemDownloadsProps) {
  const buttonClass = `${classBlock}__download-btn`

  if (item.downloads_used_up) {
    const path = buyAgainPath(item)
    return path ? (
      <Link
        className={buttonClass}
        to={path}
        title={`All ${item.downloads_limit} downloads of this purchase are used`}
      >
        Buy again
      </Link>
    ) : (
      <span className={`${classBlock}__muted`}>Downloads used up</span>
    )
  }

  if (!item.can_download) {
    return (
      <button
        type="button"
        className={buttonClass}
        disabled
        title="Downloads unlock when order and payment are both paid"
      >
        Download
      </button>
    )
  }

  if (item.files.length === 0) {
    return <span className={`${classBlock}__muted`}>{emptyLabel}</span>
  }

  if (item.files.length === 1) {
    const file = item.files[0]
    const isBusy = downloadingFileId === file.id
    return (
      <button
        type="button"
        className={buttonClass}
        disabled={isBusy}
        title={file.file_name}
        onClick={() => void onDownload(file)}
      >
        {isBusy ? 'Downloading…' : 'Download'}
      </button>
    )
  }

  return (
    <div className={`${classBlock}__download-stack`}>
      {item.files.map((file) => (
        <button
          key={file.id}
          type="button"
          className={buttonClass}
          disabled={downloadingFileId === file.id}
          onClick={() => void onDownload(file)}
        >
          {file.file_name}
        </button>
      ))}
    </div>
  )
}
