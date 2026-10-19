import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import './enquiry-review.css'

interface ContactBrief {
  project: string
  category: string
  name: string
  email: string
  company: string
  phone: string
}

interface Props<T extends ContactBrief> {
  service: string
  data: T
  files: File[]
  deliverables: string
  onChange: (key: keyof T, value: string) => void
  children: ReactNode
}

/** The review keeps each service's own editable fields and file validation. */
export function ProjectEnquiryReview<T extends ContactBrief>({ service, data, files, deliverables, onChange, children }: Props<T>) {
  return <div className="enquiry-review">
    <div className="enquiry-review__service-bar"><span><span aria-hidden="true">✓</span> Selected service: <strong>{service}</strong></span><span>Editable project brief</span></div>
    <section className="lifestyle-form__section"><h3>01 — SERVICE</h3>
      <label>Service category<select value={service} disabled><option>{service}</option></select></label>
    </section>
    {children}
    <section className="lifestyle-form__section"><h3>06 — CONTACT DETAILS</h3>
      <div className="lifestyle-form__grid">
        <label>Your name <b>*</b><input value={data.name} required minLength={2} maxLength={120} placeholder="Your full name" autoComplete="name" onChange={event => onChange('name', event.target.value)} /></label>
        <label>Email address <b>*</b><input type="email" value={data.email} required maxLength={254} placeholder="name@company.com" autoComplete="email" onChange={event => onChange('email', event.target.value)} /></label>
        <label>Company / brand name<input value={data.company} maxLength={160} placeholder="e.g. Studio Brand" autoComplete="organization" onChange={event => onChange('company', event.target.value)} /></label>
        <label>Phone / WhatsApp<input type="tel" value={data.phone} maxLength={160} placeholder="Include your country code" autoComplete="tel" onChange={event => onChange('phone', event.target.value)} /></label>
      </div>
      <label className="lifestyle-form__privacy"><input type="checkbox" required /> I agree to the <Link to="/privacy" target="_blank" rel="noreferrer">Privacy Policy</Link>.</label>
    </section>
    <dl className="enquiry-review__summary">
      {[
        ['Service', service], ['Project title', data.project || 'Untitled project'],
        ['Category', data.category || 'Not specified'], ['Deliverables', deliverables], ['Files', `${files.length} selected`],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <div className="enquiry-review__assurance"><span aria-hidden="true">✓</span><span><strong>Review before sending.</strong> Your project details will be sent to our team for quotation.</span></div>
  </div>
}
