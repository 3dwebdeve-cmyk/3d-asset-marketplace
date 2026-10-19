import { ProjectEnquirySuccess } from './ProjectEnquirySuccess'
import { createEnquiryReference, saveEnquiryConfirmation, type ProjectEnquiryConfirmation } from '../../lib/projectEnquiryConfirmation'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { submitContactForm } from '../../api/contactApi'
import { getApiErrorMessage } from '../../lib/apiError'
import './lifestyle-enquiry.css'
import { LifestyleEnquiryReview } from './LifestyleEnquiryReview'

const DRAFT_KEY = 'lifestyle-product-enquiry-draft'
const EMPTY = { project: '', category: '', products: '1', images: '4', platform: '', brief: '', environment: '', orientation: '', style: '', background: '', resolution: '', color: '', avoid: '', text: 'No', name: '', email: '', company: '', phone: '' }
export type Brief = typeof EMPTY
function readDraft(): Brief {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null')
    return Object.fromEntries(Object.entries(EMPTY).map(([key, value]) => [key, typeof saved?.[key] === 'string' ? saved[key] : value])) as Brief
  } catch { return { ...EMPTY } }
}
export function Choices({ title, hint, options, value, onChange }: { title: string; hint?: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return <fieldset className="lifestyle-form__choices"><legend>{title} <span>{hint}</span></legend><div>{options.map(option => <label key={option}><input type="radio" name={title} value={option} checked={value === option} onChange={() => onChange(option)} /><span>{option}</span></label>)}</div></fieldset>
}
// Multi-select answers are stored as a comma-separated string so they can be saved as a draft.
export function MultiChoices({ title, hint, options, value, onChange }: { title: string; hint?: string; options: string[]; value: string; onChange: (value: string) => void }) {
  const selected = value ? value.split(', ') : []
  const toggle = (option: string) => onChange((selected.includes(option) ? selected.filter(item => item !== option) : [...selected, option]).join(', '))
  return <fieldset className="lifestyle-form__choices"><legend>{title} <span>{hint}</span></legend><div>{options.map(option => <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(option)} /><span>{option}</span></label>)}</div></fieldset>
}
export function ColorField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return <><label htmlFor={id}>Background color</label><div className="lifestyle-form__color-field"><input id={id} type="text" value={value} onChange={event => onChange(event.target.value)} placeholder="e.g. #FFFFFF (Pure White)" maxLength={160} /><input className="lifestyle-form__color-picker" type="color" aria-label="Choose background color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : /^#[0-9a-f]{3}$/i.test(value) ? '#' + value.slice(1).split('').map(char => char + char).join('') : '#ffffff'} onChange={event => onChange(event.target.value.toUpperCase())} /></div></>
}
export function LifestyleEnquiryForm({ onBack }: { onBack: () => void }) {
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
    if (next.some(file => !/\.(png|jpe?g|webp|gif|pdf|zip)$/i.test(file.name))) { setError('Choose PNG, JPG, WEBP, GIF, PDF or ZIP files.'); return }
    setFiles(next); setError('')
  }
  const message = [
    'Service: Lifestyle & Product Renders', `Project: ${data.project || 'Untitled project'}`,
    `Product category: ${data.category}`, `Products: ${data.products}`, `Final images: ${data.images}`,
    `Platform: ${data.platform || 'Not specified'}`, `Project brief: ${data.brief}`,
    `Environment: ${data.environment || 'Not specified'}`, `Orientation: ${data.orientation || 'Not specified'}`,
    `Style: ${data.style || 'Not specified'}`, `Background preferences: ${data.background}`,
    `Dimensions / resolution: ${data.resolution}`, `Background color: ${data.color}`, `Avoid: ${data.avoid}`,
    `Text required: ${data.text}`, `Company / brand: ${data.company || 'Not specified'}`, `Phone / WhatsApp: ${data.phone || 'Not specified'}`, `Reference files to request by email: ${files.map(file => file.name).join(', ') || 'None'}`,
  ].join('\n')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('')
    if (!data.brief.trim()) { setError('Please describe your lifestyle scene.'); return }
    if (!review) { setReview(true); return }
    if (data.name.trim().length < 2) { setError('Enter your full name (at least two characters).'); return }
    const submittedMessage = `Reference: ${reference}\n${message}`
    setPending(true)
    try {
      await submitContactForm({ name: data.name.trim(), email: data.email.trim(), subject: `Lifestyle renders: ${data.project.trim() || data.category}`.slice(0, 200), message: submittedMessage })
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* Submission still succeeded. */ }
      setConfirmation(saveEnquiryConfirmation({ reference, service: 'Lifestyle & Product Renders', project: data.project, name: data.name.trim(), email: data.email.trim(), message: submittedMessage }))
    } catch (err) { setError(getApiErrorMessage(err, 'Could not send your enquiry. Please try again.')) }
    finally { setPending(false) }
  }
  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); setNotice('Draft saved on this device. Selected files must be chosen again when you return.'); setError('') }
    catch { setError('Your browser could not save this draft. Keep this page open to preserve your details.') }
  }
  const field = (key: keyof Brief, placeholder = '', type = 'text', required = false) => <input type={type} value={data[key]} onChange={event => set(key, event.target.value)} placeholder={placeholder} required={required} maxLength={key === 'name' ? 120 : key === 'email' ? 254 : 160} {...(type === 'number' ? { min: 1, max: 10000, step: 1 } : {})} />
  if (confirmation) return <ProjectEnquirySuccess confirmation={confirmation} />
  return <section className={`lifestyle-form${review && !success ? ' lifestyle-form--review' : ''}`} aria-label="Lifestyle and product render enquiry">
    <button type="button" className="lifestyle-form__back" onClick={onBack} disabled={pending}>← Back to services</button>
    <form onSubmit={submit}>
      <header><span className="lifestyle-form__icon" aria-hidden="true">◇</span><div><h2 ref={heading} tabIndex={-1}>{success ? 'Enquiry received' : review ? 'Review & Edit Project Enquiry' : 'Add New Product Enquiry'}</h2><p>{success ? 'Our team will follow up by email.' : review ? 'Review your brief before sending. You can edit any detail below.' : 'Configure project, files, and visual requirements'}</p></div><span className="lifestyle-form__badge">{review ? 'Ready for review' : 'Creative Brief'}</span>{review && !success && <button className="enquiry-review__print" type="button" onClick={() => window.print()}>Print summary</button>}</header>
      {success ? <div className="lifestyle-form__success" role="status"><p>Your Lifestyle &amp; Product Renders enquiry has been received for delivery.</p><button type="button" onClick={onBack}>Back to services</button></div> : <>
      {review ? <LifestyleEnquiryReview data={data} onChange={set} files={files} onAddFiles={addFiles} onRemoveFile={index => setFiles(current => current.filter((_, i) => i !== index))} /> : <>
      <section className="lifestyle-form__section"><h3>02 — PROJECT DETAILS</h3><div className="lifestyle-form__grid">
        <label>Project Name <span>(optional)</span>{field('project', 'e.g. Summer Skincare Campaign')}</label>
        <label>Product Category <b>*</b><select required value={data.category} onChange={e => set('category', e.target.value)}><option value="">Search product Category</option>{['Furniture', 'Home & Living', 'Beauty & Skincare', 'Fashion & Accessories', 'Electronics', 'Food & Beverage', 'Other'].map(category => <option key={category}>{category}</option>)}</select></label>
        <div className="lifestyle-form__grid"><label>Number of products{field('products', '1', 'number', true)}</label><label>Number of final images required{field('images', '4', 'number', true)}</label></div>
        <Choices title="Intended platform" hint="(select one)" options={['Website', 'Amazon', 'Social Media', 'Advertising', 'Print', 'Other']} value={data.platform} onChange={v => set('platform', v)} />
      </div></section>
      <section className="lifestyle-form__section"><h3>03 — PROJECT BRIEF</h3><label>What type of lifestyle scene do you need? <b>*</b><small>Describe the environment, product placement, mood, audience, and overall look you want.</small><textarea required maxLength={2000} value={data.brief} onChange={e => set('brief', e.target.value)} placeholder="Describe the environment, product placement, mood, audience, and overall look you want..." /></label>
        <Choices title="Preferred environment" hint="(select primary setting)" options={['Home', 'Studio', 'Outdoor', 'Office', 'Luxury', 'Minimal', 'Custom']} value={data.environment} onChange={v => set('environment', v)} />
        <Choices title="Image orientation" hint="(select aspect ratio)" options={['Square (1:1)', 'Portrait (4:5 / 9:16)', 'Landscape (16:9)', 'Multiple formats']} value={data.orientation} onChange={v => set('orientation', v)} />
        <Choices title="Preferred style" hint="(select visual aesthetic)" options={['Photorealistic', 'Premium', 'Minimal', 'Editorial', 'Commercial', 'Custom']} value={data.style} onChange={v => set('style', v)} />
      </section>
      <section className="lifestyle-form__section"><h3>04 — FILES</h3><small>Acceptable reference files:</small><div className="lifestyle-form__file-tags">{['Product photos', 'Logo', 'Packaging artwork', 'Brand guidelines', 'Reference images', 'ZIP / Archives'].map(tag => <span key={tag}>{tag}</span>)}</div>
        <div className="lifestyle-form__drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}><strong>Choose file or Drag and drop image here</strong><small>Images, PDF or ZIP files · up to 5 files, 20 MB each</small><button type="button" onClick={() => fileInput.current?.click()}>Browse files</button><input ref={fileInput} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.zip" hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} /></div>
        <small>File names are included in your enquiry. Our team will contact you by email to collect the files.</small>
        {files.length > 0 && <ul className="lifestyle-form__files">{files.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}<button type="button" onClick={() => setFiles(current => current.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}>×</button></li>)}</ul>}
      </section>
      <section className="lifestyle-form__section"><h3>05 — REQUIREMENTS</h3><div className="lifestyle-form__grid lifestyle-form__grid--three"><label>Background preferences{field('background', 'e.g. Marble kitchen counter, morning sunlight')}</label><label>Required dimensions / resolution{field('resolution', 'e.g. 4000×4000px, 300 DPI, 4K')}</label><div><label htmlFor="lifestyle-background-color">Background color</label><div className="lifestyle-form__color-field"><input id="lifestyle-background-color" type="text" value={data.color} onChange={event => set('color', event.target.value)} placeholder="e.g. #FFFFFF (Pure White)" maxLength={160} /><input className="lifestyle-form__color-picker" type="color" aria-label="Choose background color" value={/^#[0-9a-f]{6}$/i.test(data.color) ? data.color : /^#[0-9a-f]{3}$/i.test(data.color) ? '#' + data.color.slice(1).split('').map(char => char + char).join('') : '#ffffff'} onChange={event => set('color', event.target.value.toUpperCase())} /></div></div></div><div className="lifestyle-form__grid"><label>Specific things to avoid{field('avoid', 'e.g. No plastic props, avoid dark shadows, no glare')}</label><Choices title="Text required in image?" options={['No', 'Yes']} value={data.text} onChange={v => set('text', v)} /></div></section>
      </>}
      {error && <p className="lifestyle-form__error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      <footer><button type="button" disabled={pending} onClick={() => { setData({ ...EMPTY }); setFiles([]); setReview(false); setError(''); setNotice(''); try { localStorage.removeItem(DRAFT_KEY) } catch { /* Storage may be unavailable. */ } }}>Reset Data</button><div>{review && <button type="button" disabled={pending} onClick={() => setReview(false)}>Edit brief</button>}<button type="button" disabled={pending} onClick={saveDraft}>Save as a draft</button><button className="lifestyle-form__submit" disabled={pending} type="submit">{pending ? 'Submitting…' : review ? 'Confirm & Send Project Enquiry →' : 'Review Enquiry →'}</button></div></footer>
      </>}
    </form>
  </section>
}
