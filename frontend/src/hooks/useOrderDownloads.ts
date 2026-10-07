import { useCallback, useState } from 'react'

import { downloadCatalogFileByUrl } from '../api/downloadsApi'
import { downloadCustomerOrderInvoice } from '../api/ordersApi'
import { getApiErrorMessage } from '../lib/apiError'
import type { OrderItemDownloadFile } from '../types/download'

export function useOrderDownloads() {
  const [fileError, setFileError] = useState<string | null>(null)
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null)
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null)

  const downloadFile = useCallback(async (file: OrderItemDownloadFile) => {
    setFileError(null)
    setDownloadingFileId(file.id)
    try {
      await downloadCatalogFileByUrl(file.download_url, file.file_name)
    } catch (error) {
      setFileError(getApiErrorMessage(error, 'Could not download the file. Please try again.'))
    } finally {
      setDownloadingFileId(null)
    }
  }, [])

  const downloadInvoice = useCallback(async (orderId: string, invoiceNumber: string) => {
    setInvoiceError(null)
    setDownloadingInvoiceId(orderId)
    try {
      await downloadCustomerOrderInvoice(orderId, invoiceNumber)
    } catch (error) {
      setInvoiceError(
        getApiErrorMessage(error, 'Could not download the invoice. Please try again.'),
      )
    } finally {
      setDownloadingInvoiceId(null)
    }
  }, [])

  return {
    downloadFile,
    downloadInvoice,
    fileError,
    invoiceError,
    downloadingFileId,
    downloadingInvoiceId,
  }
}
