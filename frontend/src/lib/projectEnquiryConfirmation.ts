export interface ProjectEnquiryConfirmation {
  reference: string
  service: string
  project: string
  name: string
  email: string
  message: string
  submittedAt: string
  sessionSaved: boolean
}

/** Included in the submitted message so the same reference is available to the team. */
export function createEnquiryReference(): string {
  return `REF-ENQ-${crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`
}

export function saveEnquiryConfirmation(
  details: Omit<ProjectEnquiryConfirmation, 'submittedAt' | 'sessionSaved'>,
): ProjectEnquiryConfirmation {
  const confirmation = { ...details, submittedAt: new Date().toISOString(), sessionSaved: true }
  try {
    sessionStorage.setItem(`project-enquiry-confirmation:${details.reference}`, JSON.stringify(confirmation))
  } catch {
    confirmation.sessionSaved = false
    // Confirmation and printing still work when browser storage is unavailable.
  }
  return confirmation
}
