import { useCallback, useState } from 'react'

import { downloadCatalogFileByUrl } from '../api/downloadsApi'
import { downloadCustomerOrderInvoice, downloadOrderItemLicense } from '../api/ordersApi'
import { getApiErrorMessage } from '../lib/apiError'
import type { OrderItemDownloadFile } from '../types/download'

export function useOrderDownloads() {
  const [fileError, setFileError] = useState<string | null>(null)
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null)
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null)
  const [downloadingLicenseId, setDownloadingLicenseId] = useState<string | null>(null)

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

  const downloadLicense = useCallback(
    async (orderId: string, itemId: string, fileName: string) => {
      setFileError(null)
      setDownloadingLicenseId(itemId)
      try {
        await downloadOrderItemLicense(orderId, itemId, fileName)
      } catch (error) {
        setFileError(
          getApiErrorMessage(error, 'Could not download the license. Please try again.'),
        )
      } finally {
        setDownloadingLicenseId(null)
      }
    },
    [],
  )

  return {
    downloadFile,
    downloadInvoice,
    downloadLicense,
    fileError,
    invoiceError,
    downloadingFileId,
    downloadingInvoiceId,
    downloadingLicenseId,
  }
}
