import type { OrderItemDownloadFile } from '../../types/download'
import type { CustomerOrderItem } from '../../types/order'

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
