import { ProjectEnquirySuccess } from './ProjectEnquirySuccess'
import { createEnquiryReference, saveEnquiryConfirmation, type ProjectEnquiryConfirmation } from '../../lib/projectEnquiryConfirmation'
import { ProjectEnquiryReview } from './ProjectEnquiryReview'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { submitContactForm } from '../../api/contactApi'
import { getApiErrorMessage } from '../../lib/apiError'
import { ColorField, Choices, MultiChoices } from './LifestyleEnquiryForm'
import './lifestyle-enquiry.css'

const DRAFT_KEY = 'marketplace-enquiry-draft'
const EMPTY = { project: '', category: '', products: '1', existingListing: '', outputs: '', brief: '', benefits: '', features: '', audience: '', competitor: '', images: '', marketplace: '', color: '', highlights: '', dimensions: '', copy: '', name: '', email: '', company: '', phone: '' }
type Brief = typeof EMPTY
function readDraft(): Brief {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null')
    return Object.fromEntries(Object.entries(EMPTY).map(([key, value]) => [key, typeof saved?.[key] === 'string' ? saved[key] : value])) as Brief
  } catch { return { ...EMPTY } }
}
export function MarketplaceEnquiryForm({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<Brief>(readDraft)
  const [files, setFiles] = useState<File[]>([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [review, setReview] = useState(false)
  const [pending, setPending] = useState(false)
  const [confirmation, setConfirmation] = useState<ProjectEnquiryConfirmation | null>(null)
  const [reference] = useState(createEnquiryReference)
  const success = confirmation !== null
  const heading = useRef<HTMLHeadingElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => { heading.current?.focus(); heading.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }) }, [review, success])
  const set = (key: keyof Brief, value: string) => setData(current => ({ ...current, [key]: value }))
  function addFiles(incoming: FileList | null) {
    if (!incoming) return
    const next = [...files, ...Array.from(incoming)]
    if (next.length > 5 || next.some(file => file.size > 20 * 1024 * 1024)) { setError('Choose up to 5 files, each no larger than 20 MB.'); return }
    if (next.some(file => !/\.(png|jpe?g|webp|gif|pdf|zip|svg|obj|fbx|glb|gltf|blend|stl|step|stp|iges|igs)$/i.test(file.name))) { setError('Choose image, CAD, 3D, PDF or ZIP files.'); return }
    setFiles(next); setError('')
  }
  const orNotSpecified = (value: string) => value || 'Not specified'
  const message = [
    'Service: Marketplace Ready Package', `Project: ${data.project || 'Untitled project'}`,
    `Product category: ${orNotSpecified(data.category)}`,
    `Number of products / ASINs: ${orNotSpecified(data.products)}`,
    `Existing listing: ${orNotSpecified(data.existingListing)}`,
    `Requested outputs: ${orNotSpecified(data.outputs)}`,
    `Project brief: ${orNotSpecified(data.brief)}`,
    `Main product benefits: ${orNotSpecified(data.benefits)}`,
    `Important features: ${orNotSpecified(data.features)}`,
    `Target customer / persona: ${orNotSpecified(data.audience)}`,
    `Competitor / reference listing: ${orNotSpecified(data.competitor)}`,
    `Required number of images: ${orNotSpecified(data.images)}`,
    `Marketplace: ${orNotSpecified(data.marketplace)}`,
    `Background color: ${orNotSpecified(data.color)}`,
    `Key features to highlight: ${orNotSpecified(data.highlights)}`,
    `Image dimensions / specs: ${orNotSpecified(data.dimensions)}`,
    `Required text / copy: ${orNotSpecified(data.copy)}`,
    `Company / brand: ${orNotSpecified(data.company)}`,
    `Phone / WhatsApp: ${orNotSpecified(data.phone)}`,
    `Reference files to request by email: ${files.map(file => file.name).join(', ') || 'None'}`,
  ].join('\n')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('')
    if (!data.brief.trim()) { setError('Please describe your marketplace package requirements.'); return }
    if (!review) { setReview(true); return }
    if (data.name.trim().length < 2) { setError('Enter your full name (at least two characters).'); return }
    const submittedMessage = `Reference: ${reference}\n${message}`
    if (submittedMessage.length > 5000) { setError('Your enquiry is too long. Please shorten the brief or required copy before sending.'); return }
    setPending(true)
    try {
      await submitContactForm({ name: data.name.trim(), email: data.email.trim(), subject: `Marketplace ready package: ${data.project.trim() || data.category}`.slice(0, 200), message: submittedMessage })
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* Submission still succeeded. */ }
      setConfirmation(saveEnquiryConfirmation({ reference, service: 'Marketplace Ready Package', project: data.project, name: data.name.trim(), email: data.email.trim(), message: submittedMessage }))
    } catch (err) { setError(getApiErrorMessage(err, 'Could not send your enquiry. Please try again.')) }
    finally { setPending(false) }
  }
  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); setNotice('Draft saved on this device. Selected files must be chosen again when you return.'); setError('') }
    catch { setError('Your browser could not save this draft. Keep this page open to preserve your details.') }
  }
  const field = (key: keyof Brief, placeholder = '', type = 'text', required = false) => <input type={type} value={data[key]} onChange={event => set(key, event.target.value)} placeholder={placeholder} required={required} maxLength={key === 'name' ? 120 : key === 'email' ? 254 : 160} {...(type === 'number' ? { min: 1, max: 10000, step: 1 } : {})} />
  const briefFields = <>
    <section className="lifestyle-form__section"><h3>02 - PROJECT DETAILS</h3><div className="lifestyle-form__grid">
      <label>Project Name <span>(optional)</span>{field('project', 'e.g. Stainless Steel Water Bottle - Amazon Launch Kit')}</label>
      <label>Product Category <b>*</b><select required value={data.category} onChange={e => set('category', e.target.value)}><option value="">Search product category...</option>{['Furniture', 'Home & Living', 'Beauty & Skincare', 'Fashion & Accessories', 'Electronics', 'Food & Beverage', 'Sports & Outdoors', 'Other'].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Number of Products / ASINs{field('products', '1', 'number', true)}<small>Specify unique products or variations.</small></label>
      <Choices title="Existing Listing?" hint="(do you have an existing Amazon listing?)" options={['Yes, product is already listed', 'No, new product launch']} value={data.existingListing} onChange={v => set('existingListing', v)} />
    </div></section>
    <section className="lifestyle-form__section"><h3>03 - PROJECT BRIEF</h3>
      <div className="marketplace-enquiry__outputs"><MultiChoices title="What do you need for your Amazon listing?" hint="(select all deliverables required)" options={['Main listing image', 'Lifestyle images', 'Feature / infographics', 'Comparison graphics', 'Dimension images', 'Packaging images', 'A+ Content (EBC)', 'Brand Story', 'Product video', '3D renders']} value={data.outputs} onChange={v => set('outputs', v)} /></div>
      <label>Tell us about your product &amp; Amazon listing requirements<small>Describe your product, its unique selling points, positioning, and the content you need for your listing.</small><textarea required maxLength={2000} value={data.brief} onChange={e => set('brief', e.target.value)} placeholder="Describe your product's unique value proposition, product benefits, customer pain points and visual direction..." /></label>
      <div className="lifestyle-form__grid">
        <label>Main Product Benefits <span>(why customers buy)</span>{field('benefits', 'e.g. Keeps drinks cold for 24h, leakproof, ergonomic handle')}</label>
        <label>Important Features <span>(technical specs & features)</span>{field('features', 'e.g. 18/8 food-grade stainless steel, BPA-free, vacuum insulated')}</label>
        <label>Target Customer / Persona{field('audience', 'e.g. Fitness enthusiasts, daily commuters, busy working professionals')}</label>
        <label>Competitor / Reference Listing <span>(URL here)</span>{field('competitor', 'https://www.amazon.com/dp/...', 'url')}</label>
      </div>
    </section>
    <section className="lifestyle-form__section"><h3>04 - FILES</h3><small>Acceptable references:</small><div className="lifestyle-form__file-tags">{['Product photos', 'Logo', 'Packaging', 'Existing listing images', 'Product specifications', 'Brand guidelines', '3D models / CAD', 'Competitor examples', 'ZIP / Archives'].map(tag => <span key={tag}>{tag}</span>)}</div>
      <div className="lifestyle-form__drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}><strong>Choose file or Drag and drop image here</strong><small>Images, CAD, 3D, PDF or ZIP files - up to 5 files, 20 MB each</small><button type="button" onClick={() => fileInput.current?.click()}>Browse files</button><input ref={fileInput} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.zip,.svg,.obj,.fbx,.glb,.gltf,.blend,.stl,.step,.stp,.iges,.igs" hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} /></div>
      <small>File names are included in your enquiry. Our team will contact you by email to collect the files.</small>
      {files.length > 0 && <ul className="lifestyle-form__files">{files.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}<button type="button" onClick={() => setFiles(current => current.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}>Remove</button></li>)}</ul>}
    </section>
    <section className="lifestyle-form__section"><h3>05 - REQUIREMENTS</h3>
      <div className="lifestyle-form__grid lifestyle-form__grid--three">
        <label>Required Number of Images{field('images', '7', 'number')}</label>
        <label>Marketplace{field('marketplace', 'US (Amazon.com)')}</label>
        <div><ColorField id="marketplace-background-color" value={data.color} onChange={v => set('color', v)} /></div>
      </div>
      <div className="lifestyle-form__grid">
        <label>Key Features to Highlight{field('highlights', 'e.g. Leakproof lid, BPA-free, double-wall insulation')}</label>
        <label>Image Dimensions / Specs{field('dimensions', 'e.g. 2000 x 2000px, Amazon US image requirements')}</label>
      </div>
      <label>Required Text / Copy <span>(headlines, feature copy, product claims or other text to integrate)</span><textarea maxLength={1200} value={data.copy} onChange={e => set('copy', e.target.value)} placeholder="e.g. Infographic 1: 24h temperature control; 2: Double-wall vacuum insulation; A+ comparison text..." /></label>
    </section>
  </>
  if (confirmation) return <ProjectEnquirySuccess confirmation={confirmation} />
  return <section className={`lifestyle-form marketplace-enquiry${review && !success ? ' lifestyle-form--review' : ''}`} aria-label="Marketplace ready package enquiry">
    <button type="button" className="lifestyle-form__back" onClick={onBack} disabled={pending}>← Back to services</button>
    <form onSubmit={submit}>
      <header><span className="lifestyle-form__icon" aria-hidden="true">◇</span><div><h2 ref={heading} tabIndex={-1}>{success ? 'Enquiry received' : review ? 'Review & Edit Project Enquiry' : 'Add New Product Enquiry'}</h2><p>{success ? 'Our team will follow up by email.' : review ? 'Review your brief before sending. You can edit any detail below.' : 'High-converting Amazon listing visuals: main images, lifestyle renders, feature infographics, comparison charts, and A+ content.'}</p></div><span className="lifestyle-form__badge">{review ? 'Ready for review' : 'Marketplace Ready Package'}</span>{review && !success && <button className="enquiry-review__print" type="button" onClick={() => window.print()}>Print summary</button>}</header>
      {success ? <div className="lifestyle-form__success" role="status"><p>Your Marketplace Ready Package enquiry has been received for delivery.</p><button type="button" onClick={onBack}>Back to services</button></div> : <>
      {review ? <ProjectEnquiryReview service="Marketplace Ready Package" data={data} files={files} deliverables={`${data.images || 'Unspecified'} images - ${data.outputs || 'Outputs not specified'}`} onChange={set}>{briefFields}</ProjectEnquiryReview> : briefFields}
      {review && <pre className="marketplace-enquiry__print-details">{`Marketplace Ready Package - Project Details\n\nName: ${data.name}\nEmail: ${data.email}\n\n${message}`}</pre>}
      {error && <p className="lifestyle-form__error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      <footer><button type="button" disabled={pending} onClick={() => { setData({ ...EMPTY }); setFiles([]); setReview(false); setError(''); setNotice(''); try { localStorage.removeItem(DRAFT_KEY) } catch { /* Storage may be unavailable. */ } }}>Reset Data</button><div>{review && <button type="button" disabled={pending} onClick={() => setReview(false)}>Edit brief</button>}<button type="button" disabled={pending} onClick={saveDraft}>Save as a draft</button><button className="lifestyle-form__submit" disabled={pending} type="submit">{pending ? 'Submitting…' : review ? 'Confirm & Send Project Enquiry →' : 'Review Enquiry →'}</button></div></footer>
      </>}
    </form>
  </section>
}
