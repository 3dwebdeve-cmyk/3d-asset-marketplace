/** Client-side mirrors of backend custom_projects.upload_rules for message attachments. */

export {
  PROJECT_FILE_ACCEPT as PROJECT_MESSAGE_ATTACHMENT_ACCEPT,
  PROJECT_FILE_FORMAT_LABELS as PROJECT_MESSAGE_ATTACHMENT_FORMAT_LABELS,
  PROJECT_FILE_MAX_BYTES as PROJECT_MESSAGE_ATTACHMENT_MAX_BYTES,
  PROJECT_FILE_MAX_MB as PROJECT_MESSAGE_ATTACHMENT_MAX_MB,
  getProjectFileExtension as getProjectMessageAttachmentExtension,
  validateProjectFile as validateProjectMessageAttachment,
} from './projectFileUpload'
