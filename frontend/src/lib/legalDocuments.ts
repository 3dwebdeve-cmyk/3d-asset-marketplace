import { apiClient } from '../api/client'

/** Bootstrap defaults used by isolated component tests; live app loads the server versions. */
export const LEGAL_DOCUMENT_VERSIONS = {
  terms: '2026-09-18',
  privacy: '2026-09-18',
}

export async function loadLegalDocumentVersions(): Promise<void> {
  const { data } = await apiClient.get<{ versions: Record<string, string> }>(
    '/api/v1/auth/legal-documents/',
  )
  if (!data.versions?.terms || !data.versions?.privacy) {
    throw new Error('Current legal documents are unavailable.')
  }
  LEGAL_DOCUMENT_VERSIONS.terms = data.versions.terms
  LEGAL_DOCUMENT_VERSIONS.privacy = data.versions.privacy
}

/** Payload for register / checkout / quotation pay `accepted_legal`. */
export function currentAcceptedLegalPayload(): Record<string, string> {
  return { ...LEGAL_DOCUMENT_VERSIONS }
}

export const TERMS_PATH = '/terms'
export const PRIVACY_PATH = '/privacy'
