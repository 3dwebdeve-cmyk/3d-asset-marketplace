/** Current legal document versions — keep in sync with backend LEGAL_*_VERSION defaults. */
export const LEGAL_DOCUMENT_VERSIONS = {
  terms: '2026-09-18',
  privacy: '2026-09-18',
} as const

export type LegalDocumentVersions = typeof LEGAL_DOCUMENT_VERSIONS

/** Payload for register / checkout / quotation pay `accepted_legal`. */
export function currentAcceptedLegalPayload(): Record<string, string> {
  return { ...LEGAL_DOCUMENT_VERSIONS }
}

export const TERMS_PATH = '/terms'
export const PRIVACY_PATH = '/privacy'
