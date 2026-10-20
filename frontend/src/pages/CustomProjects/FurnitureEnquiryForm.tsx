import { ProjectEnquirySuccess } from './ProjectEnquirySuccess'
import { createEnquiryReference, saveEnquiryConfirmation, type ProjectEnquiryConfirmation } from '../../lib/projectEnquiryConfirmation'
import { ProjectEnquiryReview } from './ProjectEnquiryReview'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { submitContactForm } from '../../api/contactApi'
import { getApiErrorMessage } from '../../lib/apiError'
import { ColorField, Choices, MultiChoices } from './LifestyleEnquiryForm'
import './lifestyle-enquiry.css'

const DRAFT_KEY = 'furniture-enquiry-draft'
const EMPTY = { project: '', category: '', products: '1', visualization: '', brief: '', style: '', existingModel: '', roomRequired: '', customEnvironment: '', lightingTime: '', setting: '', dimensions: '', material: '', variants: '', renders: '', camera: '', roomDimensions: '', color: '', lighting: '', resolution: '', formats: '', name: '', email: '', company: '', phone: '' }
type Brief = typeof EMPTY
function readDraft(): Brief {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null')
    return Object.fromEntries(Object.entries(EMPTY).map(([key, value]) => [key, typeof saved?.[key] === 'string' ? saved[key] : value])) as Brief
  } catch { return { ...EMPTY } }
}
export function FurnitureEnquiryForm({ onBack }: { onBack: () => void }) {
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
    'Service: Furniture Visualization', `Project: ${data.project || 'Untitled project'}`,
    `Furniture category: ${orNotSpecified(data.category)}`,
    `Number of furniture pieces: ${orNotSpecified(data.products)}`,
    `Visualization type: ${orNotSpecified(data.visualization)}`,
    `Furniture visualization brief: ${orNotSpecified(data.brief)}`,
    `Interior style: ${orNotSpecified(data.style)}`,
    `Existing 3D model: ${orNotSpecified(data.existingModel)}`,
    `Room required: ${orNotSpecified(data.roomRequired)}`,
    `Custom environment: ${orNotSpecified(data.customEnvironment)}`,
    `Lighting time: ${orNotSpecified(data.lightingTime)}`,
    `Setting: ${orNotSpecified(data.setting)}`,
    `Furniture dimensions: ${orNotSpecified(data.dimensions)}`,
    `Material / fabric: ${orNotSpecified(data.material)}`,
    `Color variants: ${orNotSpecified(data.variants)}`,
    `Number of renders: ${orNotSpecified(data.renders)}`,
    `Camera angles: ${orNotSpecified(data.camera)}`,
    `Room dimensions: ${orNotSpecified(data.roomDimensions)}`,
    `Background color: ${orNotSpecified(data.color)}`,
    `Lighting preference: ${orNotSpecified(data.lighting)}`,
    `Render resolution: ${orNotSpecified(data.resolution)}`,
    `Required file formats: ${orNotSpecified(data.formats)}`,
    `Company / brand: ${orNotSpecified(data.company)}`,
    `Phone / WhatsApp: ${orNotSpecified(data.phone)}`,
    `Reference files to request by email: ${files.map(file => file.name).join(', ') || 'None'}`,
  ].join('\n')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('')
    if (!data.brief.trim()) { setError('Please describe the furniture visualization you want.'); return }
    if (!review) { setReview(true); return }
    if (data.name.trim().length < 2) { setError('Enter your full name (at least two characters).'); return }
    const submittedMessage = `Reference: ${reference}\n${message}`
    setPending(true)
    try {
      await submitContactForm({ name: data.name.trim(), email: data.email.trim(), subject: `Furniture visualization: ${data.project.trim() || data.category}`.slice(0, 200), message: submittedMessage })
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* Submission still succeeded. */ }
      setConfirmation(saveEnquiryConfirmation({ reference, service: 'Furniture Visualization', project: data.project, name: data.name.trim(), email: data.email.trim(), message: submittedMessage }))
    } catch (err) { setError(getApiErrorMessage(err, 'Could not send your enquiry. Please try again.')) }
    finally { setPending(false) }
  }
  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); setNotice('Draft saved on this device. Selected files must be chosen again when you return.'); setError('') }
    catch { setError('Your browser could not save this draft. Keep this page open to preserve your details.') }
  }
  const field = (key: keyof Brief, placeholder = '', type = 'text', required = false) => <input type={type} value={data[key]} onChange={event => set(key, event.target.value)} placeholder={placeholder} required={required} maxLength={key === 'name' ? 120 : key === 'email' ? 254 : 160} {...(type === 'number' ? { min: 1, max: 10000, step: 1 } : {})} />
  const yesNo = ['Yes', 'No']
  const briefFields = <>
    <section className="lifestyle-form__section"><h3>02 — PROJECT DETAILS</h3><div className="lifestyle-form__grid">
      <label>Project Name <span>(optional)</span>{field('project', 'e.g. Scandinavian Oak Dining Chair & Room Set')}</label>
      <label>Furniture Category <b>*</b><select required value={data.category} onChange={e => set('category', e.target.value)}><option value="">Search furniture category...</option>{['Furniture', 'Chairs & Seating', 'Sofas', 'Tables & Desks', 'Beds', 'Storage & Cabinets', 'Outdoor Furniture', 'Furniture Set', 'Other'].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Number of furniture pieces{field('products', '1', 'number', true)}</label>
      <Choices title="Visualization type" hint="(select primary)" options={['Product-only render', 'Interior scene', 'Room set', 'Lifestyle render', 'Custom']} value={data.visualization} onChange={v => set('visualization', v)} />
    </div></section>
    <section className="lifestyle-form__section"><h3>03 — PROJECT BRIEF</h3>
      <label>Describe the furniture visualization<small>Describe the furniture pieces, interior style, materials, room mood and overall direction.</small><textarea required maxLength={2000} value={data.brief} onChange={e => set('brief', e.target.value)} placeholder="Describe the furniture pieces, interior style, materials, room environment and visual direction..." /></label>
      <Choices title="Interior style" hint="(select design language)" options={['Modern', 'Minimal', 'Luxury', 'Scandinavian', 'Industrial', 'Contemporary', 'Traditional', 'Custom']} value={data.style} onChange={v => set('style', v)} />
      <h4 className="lifestyle-form__subhead">Scope & Scene Specifications</h4>
      <div className="lifestyle-form__grid lifestyle-form__grid--three">
        <Choices title="Existing 3D model?" options={yesNo} value={data.existingModel} onChange={v => set('existingModel', v)} />
        <Choices title="Room required?" options={yesNo} value={data.roomRequired} onChange={v => set('roomRequired', v)} />
        <Choices title="Custom environment?" options={yesNo} value={data.customEnvironment} onChange={v => set('customEnvironment', v)} />
        <Choices title="Lighting time" options={['Day', 'Night']} value={data.lightingTime} onChange={v => set('lightingTime', v)} />
        <Choices title="Setting" options={['Indoor', 'Outdoor']} value={data.setting} onChange={v => set('setting', v)} />
      </div>
    </section>
    <section className="lifestyle-form__section"><h3>04 — FILES</h3><small>Acceptable references:</small><div className="lifestyle-form__file-tags">{['Furniture photos', 'Dimensions', 'CAD drawings (STEP / IGES / STL)', 'Fabric samples', 'Material references', 'Existing 3D models (OBJ / FBX / GLB / GLTF / BLEND)', 'Room photos / Floorplans', 'Interior references', 'ZIP / Archives'].map(tag => <span key={tag}>{tag}</span>)}</div>
      <div className="lifestyle-form__drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}><strong>Choose file or Drag and drop image/document here</strong><small>Images, CAD, 3D, PDF or ZIP files · up to 5 files, 20 MB each</small><button type="button" onClick={() => fileInput.current?.click()}>Browse files</button><input ref={fileInput} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.zip,.svg,.obj,.fbx,.glb,.gltf,.blend,.stl,.step,.stp,.iges,.igs" hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} /></div>
      <small>File names are included in your enquiry. Our team will contact you by email to collect the files.</small>
      {files.length > 0 && <ul className="lifestyle-form__files">{files.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}<button type="button" onClick={() => setFiles(current => current.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}>×</button></li>)}</ul>}
    </section>
    <section className="lifestyle-form__section"><h3>05 — REQUIREMENTS</h3>
      <div className="lifestyle-form__grid lifestyle-form__grid--three">
        <label>Furniture dimensions{field('dimensions', 'e.g. W: 85cm D: 90cm H: 75cm')}</label>
        <label>Material / fabric{field('material', 'e.g. Bouclé fabric, walnut wood, brushed metal')}</label>
        <label>Color variants{field('variants', 'e.g. Forest Green, Cream White, Charcoal')}</label>
        <label>Number of renders{field('renders', 'e.g. 6', 'number')}</label>
        <label>Camera angles{field('camera', 'e.g. Front, 3/4 hero, top-down')}</label>
        <label>Room dimensions{field('roomDimensions', 'e.g. 5m x 4m, 2.8m ceiling height')}</label>
        <div><ColorField id="furniture-background-color" value={data.color} onChange={v => set('color', v)} /></div>
      </div>
      <Choices title="Lighting preference" hint="(select ambiance)" options={['Golden Hour / Sunlight', 'Soft Studio Ambient', 'Dramatic Moody / Night', 'Even Bright / High-Contrast']} value={data.lighting} onChange={v => set('lighting', v)} />
      <div className="lifestyle-form__grid">
        <Choices title="Render resolution" hint="(select deliverable)" options={['1080p (FullHD)', '2K (QHD)', '4K (Ultra HD)', '8K (Print Quality)']} value={data.resolution} onChange={v => set('resolution', v)} />
        <MultiChoices title="Required file format" hint="(select all needed)" options={['JPG / PNG (Hi-Res)', 'PSD (Layered)', 'GLTF / GLB (Web 3D)', 'FBX / OBJ (3D Models)', 'TIFF (Print)']} value={data.formats} onChange={v => set('formats', v)} />
      </div>
    </section>
  </>
  if (confirmation) return <ProjectEnquirySuccess confirmation={confirmation} />
  return <section className={`lifestyle-form furniture-enquiry${review && !success ? ' lifestyle-form--review' : ''}`} aria-label="Furniture visualization enquiry">
    <button type="button" className="lifestyle-form__back" onClick={onBack} disabled={pending}>← Back to services</button>
    <form onSubmit={submit}>
      <header><span className="lifestyle-form__icon" aria-hidden="true">◇</span><div><h2 ref={heading} tabIndex={-1}>{success ? 'Enquiry received' : review ? 'Review & Edit Project Enquiry' : 'Add New Product Enquiry'}</h2><p>{success ? 'Our team will follow up by email.' : review ? 'Review your brief before sending. You can edit any detail below.' : 'Photorealistic furniture modeling, architectural interior scenes, room sets, and commercial renders.'}</p></div><span className="lifestyle-form__badge">{review ? 'Ready for review' : 'Furniture Visualization'}</span>{review && !success && <button className="enquiry-review__print" type="button" onClick={() => window.print()}>Print summary</button>}</header>
      {success ? <div className="lifestyle-form__success" role="status"><p>Your Furniture Visualization enquiry has been received for delivery.</p><button type="button" onClick={onBack}>Back to services</button></div> : <>
      {review ? <ProjectEnquiryReview service="Furniture Visualization" data={data} files={files} deliverables={`${data.renders || 'Unspecified'} renders · ${data.resolution || 'Resolution not specified'}`} onChange={set}>{briefFields}</ProjectEnquiryReview> : briefFields}
      {review && <pre className="furniture-enquiry__print-details">{`Furniture Visualization — Project Details\n\nName: ${data.name}\nEmail: ${data.email}\n\n${message}`}</pre>}
      {error && <p className="lifestyle-form__error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      <footer><button type="button" disabled={pending} onClick={() => { setData({ ...EMPTY }); setFiles([]); setReview(false); setError(''); setNotice(''); try { localStorage.removeItem(DRAFT_KEY) } catch { /* Storage may be unavailable. */ } }}>Reset Data</button><div>{review && <button type="button" disabled={pending} onClick={() => setReview(false)}>Edit brief</button>}<button type="button" disabled={pending} onClick={saveDraft}>Save as a draft</button><button className="lifestyle-form__submit" disabled={pending} type="submit">{pending ? 'Submitting…' : review ? 'Confirm & Send Project Enquiry →' : 'Review Enquiry →'}</button></div></footer>
      </>}
    </form>
  </section>
}
