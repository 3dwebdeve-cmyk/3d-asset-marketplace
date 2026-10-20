import { ProjectEnquirySuccess } from './ProjectEnquirySuccess'
import { createEnquiryReference, saveEnquiryConfirmation, type ProjectEnquiryConfirmation } from '../../lib/projectEnquiryConfirmation'
import { ProjectEnquiryReview } from './ProjectEnquiryReview'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { submitContactForm } from '../../api/contactApi'
import { getApiErrorMessage } from '../../lib/apiError'
import { ColorField, Choices, MultiChoices } from './LifestyleEnquiryForm'
import './lifestyle-enquiry.css'

const DRAFT_KEY = 'custom-service-enquiry-draft'
const EMPTY = { project: '', category: '', assets: '1', purpose: '', usage: '', brief: '', style: '', deliverables: '', software: '', formats: '', dimensions: '', technical: '', compatibility: '', quality: '', preferredFormat: '', color: '', additional: '', name: '', email: '', company: '', phone: '' }
type Brief = typeof EMPTY
function readDraft(): Brief {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null')
    return Object.fromEntries(Object.entries(EMPTY).map(([key, value]) => [key, typeof saved?.[key] === 'string' ? saved[key] : value])) as Brief
  } catch { return { ...EMPTY } }
}
export function CustomServiceEnquiryForm({ onBack }: { onBack: () => void }) {
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
    if (next.some(file => !/\.(png|jpe?g|webp|gif|pdf|zip|svg|obj|fbx|glb|gltf|blend|stl|step|stp|iges|igs|mp4|mov|mp3|wav|ai|psd)$/i.test(file.name))) { setError('Choose image, video, audio, design, CAD, 3D, PDF or ZIP files.'); return }
    setFiles(next); setError('')
  }
  const orNotSpecified = (value: string) => value || 'Not specified'
  const message = [
    'Service: Other / Custom Service', `Project: ${data.project || 'Untitled project'}`,
    `Service type: ${orNotSpecified(data.category)}`,
    `Number of assets: ${orNotSpecified(data.assets)}`,
    `Target / purpose / platform: ${orNotSpecified(data.purpose)}`,
    `Intended use: ${orNotSpecified(data.usage)}`,
    `Custom service brief: ${orNotSpecified(data.brief)}`,
    `Preferred style / quality: ${orNotSpecified(data.style)}`,
    `Required deliverables: ${orNotSpecified(data.deliverables)}`,
    `Software preference: ${orNotSpecified(data.software)}`,
    `Output formats: ${orNotSpecified(data.formats)}`,
    `Required dimensions: ${orNotSpecified(data.dimensions)}`,
    `Technical specifications: ${orNotSpecified(data.technical)}`,
    `Software compatibility: ${orNotSpecified(data.compatibility)}`,
    `Quality / usage: ${orNotSpecified(data.quality)}`,
    `Preferred file format: ${orNotSpecified(data.preferredFormat)}`,
    `Background color: ${orNotSpecified(data.color)}`,
    `Additional instructions: ${orNotSpecified(data.additional)}`,
    `Company / brand: ${orNotSpecified(data.company)}`,
    `Phone / WhatsApp: ${orNotSpecified(data.phone)}`,
    `Reference files to request by email: ${files.map(file => file.name).join(', ') || 'None'}`,
  ].join('\n')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('')
    if (!data.brief.trim()) { setError('Please describe the custom service you need.'); return }
    if (!review) { setReview(true); return }
    if (data.name.trim().length < 2) { setError('Enter your full name (at least two characters).'); return }
    const submittedMessage = `Reference: ${reference}\n${message}`
    if (submittedMessage.length > 5000) { setError('Your enquiry is too long. Please shorten the brief or additional instructions before sending.'); return }
    setPending(true)
    try {
      await submitContactForm({ name: data.name.trim(), email: data.email.trim(), subject: `Custom service: ${data.project.trim() || data.category}`.slice(0, 200), message: submittedMessage })
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* Submission still succeeded. */ }
      setConfirmation(saveEnquiryConfirmation({ reference, service: 'Other / Custom Service', project: data.project, name: data.name.trim(), email: data.email.trim(), message: submittedMessage }))
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
      <label>Project Name <span>(optional)</span>{field('project', 'e.g. Custom Luxury Product Experience')}</label>
      <label>Service Type <b>*</b>{field('category', 'e.g. Custom rendering, interactive demo, technical visualization', 'text', true)}</label>
      <label>Number of assets{field('assets', 'e.g. 12 assets or scenes', 'number', true)}</label>
      <label>Target / Purpose / Platform{field('purpose', 'e.g. Website, Unreal Engine 5, Unity, Shopify')}</label>
      <div className="lifestyle-form__grid--full"><Choices title="Intended use" hint="(select target application)" options={['Web / E-commerce', 'Mobile App / AR', 'Game Engine (Unreal / Unity)', 'Marketing / Advertising', 'Visual Production / Film', 'Other']} value={data.usage} onChange={v => set('usage', v)} /></div>
    </div></section>
    <section className="lifestyle-form__section"><h3>03 - PROJECT BRIEF</h3>
      <label>Tell us what you need<small>Describe your project goals, specific requirements, expected results, and any constraints or special requests.</small><textarea required maxLength={2000} value={data.brief} onChange={e => set('brief', e.target.value)} placeholder="Describe your project goals, technical requirements, expected deliverables and any special requirements..." /></label>
      <Choices title="Preferred style / quality" hint="(select desired outcome)" options={['Photorealistic', 'Game Ready / Real-time', 'Stylized / Conceptual', 'Technical / CAD Precision', 'Creative VFX', 'Custom']} value={data.style} onChange={v => set('style', v)} />
      <div className="lifestyle-form__grid">
        <label>Required deliverables{field('deliverables', 'e.g. 3D models, textures, animations, source files, documentation')}</label>
        <label>Software preference{field('software', 'e.g. Blender, Unreal, Maya, C4D, Cinema 4D, Unreal Engine')}</label>
      </div>
      <MultiChoices title="Output format" hint="(select all needed)" options={['3D Models (GLB / FBX / OBJ)', 'Hi-Res Renders (JPG / PNG)', 'Animation (MP4 / ProRes)', 'Source Files / Editable Packages', 'Custom Project Files']} value={data.formats} onChange={v => set('formats', v)} />
    </section>
    <section className="lifestyle-form__section"><h3>04 - FILES</h3><small>Acceptable references:</small><div className="lifestyle-form__file-tags">{['Images', 'Video', 'PDF', 'AI / PSD', '3D models', 'CAD drawings', 'Brand assets', 'ZIP / Archives'].map(tag => <span key={tag}>{tag}</span>)}</div>
      <div className="lifestyle-form__drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}><strong>Choose file or Drag and drop image here</strong><small>Images, video, audio, design, CAD, 3D, PDF or ZIP files - up to 5 files, 20 MB each</small><button type="button" onClick={() => fileInput.current?.click()}>Browse files</button><input ref={fileInput} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.zip,.svg,.obj,.fbx,.glb,.gltf,.blend,.stl,.step,.stp,.iges,.igs,.mp4,.mov,.mp3,.wav,.ai,.psd" hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} /></div>
      <small>File names are included in your enquiry. Our team will contact you by email to collect the files.</small>
      {files.length > 0 && <ul className="lifestyle-form__files">{files.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}<button type="button" onClick={() => setFiles(current => current.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}>Remove</button></li>)}</ul>}
    </section>
    <section className="lifestyle-form__section"><h3>05 - REQUIREMENTS</h3>
      <div className="lifestyle-form__grid lifestyle-form__grid--three">
        <label>Required dimensions{field('dimensions', 'e.g. Real-world scale / 4K rendering output')}</label>
        <label>Technical specifications{field('technical', 'e.g. Max 50k polygons, PBR textures, LODs')}</label>
        <label>Software compatibility{field('compatibility', 'e.g. Blender 4.x, Unreal Engine 5.3+')}</label>
        <label>Quality / Usage{field('quality', 'e.g. Production-ready / optimized game asset')}</label>
        <label>Preferred file format{field('preferredFormat', 'e.g. Blend / GLB / FBX / PNG')}</label>
        <div><ColorField id="custom-service-background-color" value={data.color} onChange={v => set('color', v)} /></div>
      </div>
      <label>Additional instructions<textarea maxLength={1200} value={data.additional} onChange={e => set('additional', e.target.value)} placeholder="Any specific rendering requirements, brand direction, delivery notes or other details..." /></label>
    </section>
  </>
  if (confirmation) return <ProjectEnquirySuccess confirmation={confirmation} />
  return <section className={`lifestyle-form custom-service-enquiry${review && !success ? ' lifestyle-form--review' : ''}`} aria-label="Other / custom service enquiry">
    <button type="button" className="lifestyle-form__back" onClick={onBack} disabled={pending}>← Back to services</button>
    <form onSubmit={submit}>
      <header><span className="lifestyle-form__icon" aria-hidden="true">◇</span><div><h2 ref={heading} tabIndex={-1}>{success ? 'Enquiry received' : review ? 'Review & Edit Project Enquiry' : 'Add New Product Enquiry'}</h2><p>{success ? 'Our team will follow up by email.' : review ? 'Review your brief before sending. You can edit any detail below.' : 'Custom 3D modeling, interactive demos, specialized production, technical visualization, and personalized services.'}</p></div><span className="lifestyle-form__badge">{review ? 'Ready for review' : 'Other / Custom Service'}</span>{review && !success && <button className="enquiry-review__print" type="button" onClick={() => window.print()}>Print summary</button>}</header>
      {success ? <div className="lifestyle-form__success" role="status"><p>Your Other / Custom Service enquiry has been received for delivery.</p><button type="button" onClick={onBack}>Back to services</button></div> : <>
      {review ? <ProjectEnquiryReview service="Other / Custom Service" data={data} files={files} deliverables={data.deliverables || data.formats || 'Deliverables not specified'} onChange={set}>{briefFields}</ProjectEnquiryReview> : briefFields}
      {review && <pre className="custom-service-enquiry__print-details">{`Other / Custom Service - Project Details\n\nName: ${data.name}\nEmail: ${data.email}\n\n${message}`}</pre>}
      {error && <p className="lifestyle-form__error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      <footer><button type="button" disabled={pending} onClick={() => { setData({ ...EMPTY }); setFiles([]); setReview(false); setError(''); setNotice(''); try { localStorage.removeItem(DRAFT_KEY) } catch { /* Storage may be unavailable. */ } }}>Reset Data</button><div>{review && <button type="button" disabled={pending} onClick={() => setReview(false)}>Edit brief</button>}<button type="button" disabled={pending} onClick={saveDraft}>Save as a draft</button><button className="lifestyle-form__submit" disabled={pending} type="submit">{pending ? 'Submitting…' : review ? 'Confirm & Send Project Enquiry →' : 'Review Enquiry →'}</button></div></footer>
      </>}
    </form>
  </section>
}
