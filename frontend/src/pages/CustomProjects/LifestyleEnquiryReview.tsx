import { useRef } from 'react'
import { Link } from 'react-router-dom'
import type { Brief } from './LifestyleEnquiryForm'
import './enquiry-review.css'

interface Props {
  data: Brief
  onChange: (key: keyof Brief, value: string) => void
  files: File[]
  onAddFiles: (files: FileList | null) => void
  onRemoveFile: (index: number) => void
}

export function LifestyleEnquiryReview({ data, onChange, files, onAddFiles, onRemoveFile }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const input = (key: keyof Brief, placeholder = '', type = 'text', required = false) => (
    <input type={type} value={data[key]} placeholder={placeholder} required={required}
      maxLength={key === 'email' ? 254 : key === 'name' ? 120 : 160}
      {...(type === 'number' ? { min: 1, max: 10000, step: 1 } : {})}
      onChange={event => onChange(key, event.target.value)} />
  )
  const select = (key: keyof Brief, options: string[], required = false) => (
    <select value={data[key]} required={required} onChange={event => onChange(key, event.target.value)}>
      <option value="">Select an option</option>
      {options.map(option => <option key={option}>{option}</option>)}
    </select>
  )

  return <div className="enquiry-review">
    <div className="enquiry-review__service-bar"><span><span aria-hidden="true">✓</span> Selected service: <strong>Lifestyle &amp; Product Renders</strong></span><span>Editable project brief</span></div>

    <section className="lifestyle-form__section"><h3>01 — SERVICE &amp; PROJECT NAME</h3>
      <div className="lifestyle-form__grid">
        <label>Service category<select value="Lifestyle & Product Renders" disabled><option>Lifestyle &amp; Product Renders</option></select></label>
        <label>Project name{input('project', 'e.g. Summer Skincare Campaign')}</label>
      </div>
    </section>

    <section className="lifestyle-form__section"><h3>02 — PRODUCT DETAILS &amp; QUANTITY</h3>
      <div className="lifestyle-form__grid enquiry-review__four-columns">
        <label>Product category <b>*</b>{select('category', ['Furniture', 'Home & Living', 'Beauty & Skincare', 'Fashion & Accessories', 'Electronics', 'Food & Beverage', 'Other'], true)}</label>
        <label>Number of products{input('products', '1', 'number', true)}</label>
        <label>Images / deliverables count{input('images', '4', 'number', true)}</label>
        <label>Target platform{select('platform', ['Website', 'Amazon', 'Social Media', 'Advertising', 'Print', 'Other'])}</label>
      </div>
    </section>

    <section className="lifestyle-form__section"><h3>03 — PROJECT BRIEF &amp; CREATIVE DIRECTION</h3>
      <div className="lifestyle-form__grid lifestyle-form__grid--three">
        <label>Preferred visual style{select('style', ['Photorealistic', 'Premium', 'Minimal', 'Editorial', 'Commercial', 'Custom'])}</label>
        <label>Background preferences{input('background', 'e.g. Marble counter, morning light')}</label>
        <label>Environment / setting{select('environment', ['Home', 'Studio', 'Outdoor', 'Office', 'Luxury', 'Minimal', 'Custom'])}</label>
      </div>
      <label>Creative direction &amp; project description <b>*</b><textarea required maxLength={2000} value={data.brief} onChange={event => onChange('brief', event.target.value)} /></label>
      <div className="lifestyle-form__grid enquiry-review__creative-options">
        <label>Orientation / aspect ratio{select('orientation', ['Square (1:1)', 'Portrait (4:5 / 9:16)', 'Landscape (16:9)', 'Multiple formats'])}</label>
        <label>Specific things to avoid{input('avoid', 'Anything we should avoid in the scene')}</label>
      </div>
    </section>

    <section className="lifestyle-form__section"><h3>04 — REFERENCE FILES &amp; ASSETS</h3>
      <div className="enquiry-review__drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); onAddFiles(event.dataTransfer.files) }}>
        <span className="enquiry-review__file-icon" aria-hidden="true">↥</span>
        <button type="button" onClick={() => fileInput.current?.click()}>Choose reference files</button>
        <span>or drag and drop them here</span>
        <small>PNG, JPG, WEBP, GIF, PDF or ZIP · up to 5 files, 20 MB each</small>
        <input ref={fileInput} aria-label="Choose reference files" type="file" hidden multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.zip" onChange={event => { onAddFiles(event.target.files); event.target.value = '' }} />
      </div>
      <small>File names are included in your enquiry. Our team will collect the files by email.</small>
      {files.length > 0 && <ul className="enquiry-review__files">{files.map((file, index) => <li key={`${file.name}-${index}`}><span><span aria-hidden="true">▤</span> {file.name} <small>({(file.size / 1024 / 1024).toFixed(2)} MB)</small></span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => onRemoveFile(index)}>×</button></li>)}</ul>}
    </section>

    <section className="lifestyle-form__section"><h3>05 — TECHNICAL REQUIREMENTS &amp; DELIVERABLES</h3>
      <div className="lifestyle-form__grid lifestyle-form__grid--three">
        <label>Required dimensions / resolution{input('resolution', 'e.g. 4000 × 4000 px, 300 DPI, 4K')}</label>
        <label>Background color{input('color', 'e.g. #FFFFFF')}</label>
        <label>Text required in image?{select('text', ['No', 'Yes'])}</label>
      </div>
    </section>

    <section className="lifestyle-form__section"><h3>06 — CONTACT DETAILS</h3>
      <div className="lifestyle-form__grid">
        <label>Your name <b>*</b>{input('name', 'Your full name', 'text', true)}</label>
        <label>Email address <b>*</b>{input('email', 'name@company.com', 'email', true)}</label>
        <label>Company / brand name{input('company', 'e.g. Studio Brand')}</label>
        <label>Phone / WhatsApp{input('phone', 'Include your country code', 'tel')}</label>
      </div>
      <label className="lifestyle-form__privacy"><input type="checkbox" required /> I agree to the <Link to="/privacy" target="_blank" rel="noreferrer">Privacy Policy</Link>.</label>
    </section>

    <dl className="enquiry-review__summary">
      {[
        ['Service', 'Lifestyle & Product Renders'], ['Project title', data.project || 'Untitled project'],
        ['Category', data.category || 'Not specified'], ['Deliverables', `${data.images} image(s)`],
        ['Files', `${files.length} selected`],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <div className="enquiry-review__assurance"><span aria-hidden="true">✓</span><span><strong>Review before sending.</strong> Your project details will be sent to our team for quotation.</span></div>
  </div>
}
