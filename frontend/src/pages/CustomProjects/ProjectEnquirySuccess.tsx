import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { createPortal } from 'react-dom'
import type { ProjectEnquiryConfirmation } from '../../lib/projectEnquiryConfirmation'
import { LOGO_PATH, SITE_NAME } from '../../lib/seo'
import './project-enquiry-success.css'

export function ProjectEnquirySuccess({ confirmation }: { confirmation: ProjectEnquiryConfirmation }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
    heading.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }, [])

  return <section className="enquiry-success" aria-labelledby="enquiry-success-title">
    <div className="enquiry-success__check" aria-hidden="true">
      <svg width="52" height="52" viewBox="0 0 52 52" fill="none"><path d="M46 25a20 20 0 1 1-9-16" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/><path d="m20 24 7 7L46 12" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </div>
    <p className="enquiry-success__eyebrow" role="status">Submission successful</p>
    <h2 id="enquiry-success-title" ref={heading} tabIndex={-1}>Project Enquiry Confirmed!</h2>
    <p className="enquiry-success__intro">Thank you! Your project enquiry and specifications have been received for delivery to our 3D production team.</p>
    <div className="enquiry-success__reference">
      <p>Your Project Reference Code</p>
      <strong>{confirmation.reference}</strong>
      <p>{confirmation.sessionSaved ? 'A confirmation summary has been saved to this browser tab’s session. ' : 'Keep this reference code or print your enquiry details. '}Our team will review your brief and follow up by email.</p>
    </div>
    <div className="enquiry-success__actions">
      <button type="button" onClick={() => window.print()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M6 8V3h12v5M6 17H3V9h18v8h-3M6 14h12v7H6z"/><path d="M17 11h1"/></svg>
        Print / Download Enquiry Details
      </button>
      <Link to="/">Return to Marketplace Home</Link>
    </div>
    {createPortal(<article className="enquiry-print" aria-label="Printable project enquiry">
      <header className="enquiry-print__header">
        <img src={LOGO_PATH} alt={SITE_NAME} width="190" height="45" />
        <div><p>PROJECT ENQUIRY</p><h1>Enquiry confirmation</h1></div>
      </header>
      <dl className="enquiry-print__metadata">
        <div><dt>Reference code</dt><dd>{confirmation.reference}</dd></div>
        <div><dt>Submitted</dt><dd>{new Date(confirmation.submittedAt).toLocaleString()}</dd></div>
        <div><dt>Project name</dt><dd>{confirmation.project || 'Untitled project'}</dd></div>
        <div><dt>Service</dt><dd>{confirmation.service}</dd></div>
        <div><dt>Contact name</dt><dd>{confirmation.name}</dd></div>
        <div><dt>Email address</dt><dd>{confirmation.email}</dd></div>
      </dl>
      <section className="enquiry-print__brief">
        <h2>Complete project details &amp; specifications</h2>
        <pre>{confirmation.message}</pre>
      </section>
      <footer>Keep this confirmation for your records. Quote {confirmation.reference} when contacting our team.</footer>
    </article>, document.body)}
  </section>
}
