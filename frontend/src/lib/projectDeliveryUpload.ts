/** Client-side mirrors of backend custom_projects.upload_rules for deliverable uploads. */

export {
  PROJECT_FILE_ACCEPT as PROJECT_DELIVERY_ACCEPT,
  PROJECT_FILE_FORMAT_LABELS as PROJECT_DELIVERY_FORMAT_LABELS,
  PROJECT_FILE_MAX_BYTES as PROJECT_DELIVERY_MAX_BYTES,
  PROJECT_FILE_MAX_MB as PROJECT_DELIVERY_MAX_MB,
  getProjectFileExtension as getProjectDeliveryExtension,
  validateProjectFile as validateProjectDeliveryFile,
} from './projectFileUpload'
