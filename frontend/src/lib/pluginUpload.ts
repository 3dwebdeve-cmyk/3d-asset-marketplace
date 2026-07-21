export {
  formatFileSize,
  formatFormatLabel,
  PRODUCT_IMAGE_ACCEPT as PLUGIN_IMAGE_ACCEPT,
  PRODUCT_IMAGE_FORMAT_LABELS as PLUGIN_IMAGE_FORMAT_LABELS,
  PRODUCT_IMAGE_MAX_MB as PLUGIN_IMAGE_MAX_MB,
} from './productUpload'

export const PLUGIN_PACKAGE_ACCEPT =
  '.zip,.rar,.7z,application/zip,application/x-zip-compressed,application/vnd.rar,application/x-rar-compressed,application/x-7z-compressed'

export const PLUGIN_PACKAGE_FORMAT_LABELS = ['ZIP', 'RAR', '7Z'] as const
export const PLUGIN_PACKAGE_MAX_MB = 50
