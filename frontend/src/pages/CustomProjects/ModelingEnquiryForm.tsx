import { ProjectEnquirySuccess } from './ProjectEnquirySuccess'
import { createEnquiryReference, saveEnquiryConfirmation, type ProjectEnquiryConfirmation } from '../../lib/projectEnquiryConfirmation'
import { ProjectEnquiryReview } from './ProjectEnquiryReview'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { submitContactForm } from '../../api/contactApi'
import { getApiErrorMessage } from '../../lib/apiError'
import { ColorField, Choices, MultiChoices } from './LifestyleEnquiryForm'
import './lifestyle-enquiry.css'

const DRAFT_KEY = 'modeling-enquiry-draft'
const EMPTY = { project: '', category: '', models: '1', purpose: '', software: '', brief: '', geometry: '', formats: '', texturing: '', uvMapping: '', pbr: '', rigging: '', animation: '', webOptimised: '', dimensions: '', polygons: '', color: '', textureResolution: '', naming: '', realScale: '', separateMeshes: '', lod: '', draco: '', name: '', email: '', company: '', phone: '' }
type Brief = typeof EMPTY
function readDraft(): Brief {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null')
    return Object.fromEntries(Object.entries(EMPTY).map(([key, value]) => [key, typeof saved?.[key] === 'string' ? saved[key] : value])) as Brief
  } catch { return { ...EMPTY } }
}
export function ModelingEnquiryForm({ onBack }: { onBack: () => void }) {
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
  const orNotSpecified = (value: string) => value || 'Not specified'
  const message = [
    'Service: 3D Modeling', `Project: ${data.project || 'Untitled project'}`,
    `Product category: ${data.category}`, `Number of models: ${data.models}`,
    `Model purpose: ${orNotSpecified(data.purpose)}`, `Target software / platform: ${orNotSpecified(data.software)}`,
    `Model brief: ${data.brief}`, `Geometry detail: ${orNotSpecified(data.geometry)}`,
    `Required formats: ${orNotSpecified(data.formats)}`,
    `Texturing required: ${orNotSpecified(data.texturing)}`, `UV mapping required: ${orNotSpecified(data.uvMapping)}`,
    `PBR materials required: ${orNotSpecified(data.pbr)}`, `Rigging required: ${orNotSpecified(data.rigging)}`,
    `Animation ready: ${orNotSpecified(data.animation)}`, `Web optimised: ${orNotSpecified(data.webOptimised)}`,
    `Exact dimensions: ${orNotSpecified(data.dimensions)}`, `Polygon limitation: ${orNotSpecified(data.polygons)}`,
    `Background color: ${orNotSpecified(data.color)}`, `Texture resolution: ${orNotSpecified(data.textureResolution)}`,
    `Naming convention: ${orNotSpecified(data.naming)}`, `Real-world scale required: ${orNotSpecified(data.realScale)}`,
    `Separate meshes required: ${orNotSpecified(data.separateMeshes)}`, `LOD required: ${orNotSpecified(data.lod)}`,
    `Draco / web compression: ${orNotSpecified(data.draco)}`,
    `Company / brand: ${data.company || 'Not specified'}`, `Phone / WhatsApp: ${data.phone || 'Not specified'}`,
    `Reference files to request by email: ${files.map(file => file.name).join(', ') || 'None'}`,
  ].join('\n')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('')
    if (!data.brief.trim()) { setError('Please describe the 3D model you need.'); return }
    if (!review) { setReview(true); return }
    if (data.name.trim().length < 2) { setError('Enter your full name (at least two characters).'); return }
    const submittedMessage = `Reference: ${reference}\n${message}`
    setPending(true)
    try {
      await submitContactForm({ name: data.name.trim(), email: data.email.trim(), subject: `3D modeling: ${data.project.trim() || data.category}`.slice(0, 200), message: submittedMessage })
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* Submission still succeeded. */ }
      setConfirmation(saveEnquiryConfirmation({ reference, service: '3D Modeling', project: data.project, name: data.name.trim(), email: data.email.trim(), message: submittedMessage }))
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
        <label>Project Name <span>(optional)</span>{field('project', 'e.g. Ergonomic Office Chair 3D Model')}</label>
        <label>Product Category <b>*</b><select required value={data.category} onChange={e => set('category', e.target.value)}><option value="">Search product category</option>{['Furniture', 'Home & Living', 'Beauty & Skincare', 'Fashion & Accessories', 'Electronics', 'Food & Beverage', 'Other'].map(category => <option key={category}>{category}</option>)}</select></label>
        <label>Number of models{field('models', '1', 'number', true)}</label>
        <MultiChoices title="Model purpose" hint="(select all that apply)" options={['E-commerce', 'Website 3D viewer', 'AR', 'VR', 'Animation', 'Rendering', 'Game', 'Manufacturing visualization', 'Other']} value={data.purpose} onChange={v => set('purpose', v)} />
        <div className="lifestyle-form__grid--full"><MultiChoices title="Target software / platform" hint="(select all required)" options={['Blender', 'Three.js', 'Unity', 'Unreal Engine', 'Web (universal)', 'AR (QuickLook / Scene Viewer)', 'Other']} value={data.software} onChange={v => set('software', v)} /></div>
      </div></section>
      <section className="lifestyle-form__section"><h3>03 — PROJECT BRIEF</h3>
        <label>Tell us about the 3D model you need<small>Describe the product, required level of detail, materials, textures, functionality and intended use.</small><textarea required maxLength={2000} value={data.brief} onChange={e => set('brief', e.target.value)} placeholder="Describe the product, required level of detail, materials, textures, functionality and intended use..." /></label>
        <div className="lifestyle-form__grid">
          <Choices title="Preferred geometry" hint="(select target density)" options={['Low Poly (Games / Mobile)', 'Mid Poly (Web / AR)', 'High Poly (Subdivision)', 'Photorealistic (Hero visuals)']} value={data.geometry} onChange={v => set('geometry', v)} />
          <MultiChoices title="Required file format" hint="(select all needed)" options={['BLEND', 'FBX', 'OBJ', 'GLB / GLTF', 'USDZ', 'STL', 'STEP / IGES', 'Other']} value={data.formats} onChange={v => set('formats', v)} />
        </div>
        <h4 className="lifestyle-form__subhead">Technical feature specifications</h4>
        <div className="lifestyle-form__grid lifestyle-form__grid--three">
          <Choices title="Texturing required?" options={yesNo} value={data.texturing} onChange={v => set('texturing', v)} />
          <Choices title="UV mapping required?" options={yesNo} value={data.uvMapping} onChange={v => set('uvMapping', v)} />
          <Choices title="PBR materials required?" options={yesNo} value={data.pbr} onChange={v => set('pbr', v)} />
          <Choices title="Rigging required?" options={yesNo} value={data.rigging} onChange={v => set('rigging', v)} />
          <Choices title="Animation ready?" options={yesNo} value={data.animation} onChange={v => set('animation', v)} />
          <Choices title="Web optimised?" options={yesNo} value={data.webOptimised} onChange={v => set('webOptimised', v)} />
        </div>
      </section>
      <section className="lifestyle-form__section"><h3>04 — FILES</h3><small>Acceptable reference files and measurements:</small><div className="lifestyle-form__file-tags">{['Product photos', 'Front / side / top views', 'Drawings / technical sheets', 'CAD files (STEP / IGES)', 'Dimensions', 'Physical references', 'Texture references', 'Existing 3D files', 'Packaging artwork', 'ZIP / Archives'].map(tag => <span key={tag}>{tag}</span>)}</div>
        <p className="lifestyle-form__tip">Tip: multi-angle images and orthographic views (front, side, top) with dimensions give the most accurate models.</p>
        <div className="lifestyle-form__drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}><strong>Choose file or Drag and drop reference here</strong><small>Images, PDF or ZIP files · up to 5 files, 20 MB each</small><button type="button" onClick={() => fileInput.current?.click()}>Browse files</button><input ref={fileInput} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.zip" hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} /></div>
        <small>File names are included in your enquiry. Our team will contact you by email to collect the files.</small>
        {files.length > 0 && <ul className="lifestyle-form__files">{files.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}<button type="button" onClick={() => setFiles(current => current.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}>×</button></li>)}</ul>}
      </section>
      <section className="lifestyle-form__section"><h3>05 — REQUIREMENTS</h3>
        <div className="lifestyle-form__grid lifestyle-form__grid--three">
          <label>Exact dimensions (W × H × D){field('dimensions', 'e.g. 350mm × 75mm × 40mm')}</label>
          <label>Polygon limitation{field('polygons', 'e.g. 40k triangles, Max 25k quads')}</label>
          <div><ColorField id="modeling-background-color" value={data.color} onChange={value => set('color', value)} /></div>
        </div>
        <div className="lifestyle-form__grid lifestyle-form__grid--three">
          <Choices title="Texture resolution" hint="(select target size)" options={['1K (1024)', '2K (2048)', '4K (4096)', '8K (8192)']} value={data.textureResolution} onChange={v => set('textureResolution', v)} />
          <label>Naming convention <span>(optional)</span>{field('naming', 'e.g. SKU_ASSETNAME_LOD0_Cam_Scale')}</label>
        </div>
        <div className="lifestyle-form__grid lifestyle-form__grid--three">
          <Choices title="Real-world scale required?" options={yesNo} value={data.realScale} onChange={v => set('realScale', v)} />
          <Choices title="Separate meshes required?" options={yesNo} value={data.separateMeshes} onChange={v => set('separateMeshes', v)} />
          <Choices title="LOD required?" options={yesNo} value={data.lod} onChange={v => set('lod', v)} />
          <Choices title="Web compression / Draco?" options={yesNo} value={data.draco} onChange={v => set('draco', v)} />
        </div>
      </section>
  </>
  if (confirmation) return <ProjectEnquirySuccess confirmation={confirmation} />
  return <section className={`lifestyle-form${review && !success ? ' lifestyle-form--review' : ''}`} aria-label="3D modeling enquiry">
    <button type="button" className="lifestyle-form__back" onClick={onBack} disabled={pending}>← Back to services</button>
    <form onSubmit={submit}>
      <header><span className="lifestyle-form__icon" aria-hidden="true">◇</span><div><h2 ref={heading} tabIndex={-1}>{success ? 'Enquiry received' : review ? 'Review & Edit Project Enquiry' : 'Add New Product Enquiry'}</h2><p>{success ? 'Our team will follow up by email.' : review ? 'Review your brief before sending. You can edit any detail below.' : 'Technical 3D modeling specifications, geometry fidelity, materials, and file requirements.'}</p></div><span className="lifestyle-form__badge">{review ? 'Ready for review' : '3D Modeling'}</span>{review && !success && <button className="enquiry-review__print" type="button" onClick={() => window.print()}>Print summary</button>}</header>
      {success ? <div className="lifestyle-form__success" role="status"><p>Your 3D Modeling enquiry has been received for delivery.</p><button type="button" onClick={onBack}>Back to services</button></div> : <>
      {review ? <ProjectEnquiryReview service="3D Modeling" data={data} files={files} deliverables={`${data.models} model(s)`} onChange={set}>{briefFields}</ProjectEnquiryReview> : briefFields}
      {error && <p className="lifestyle-form__error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      <footer><button type="button" disabled={pending} onClick={() => { setData({ ...EMPTY }); setFiles([]); setReview(false); setError(''); setNotice(''); try { localStorage.removeItem(DRAFT_KEY) } catch { /* Storage may be unavailable. */ } }}>Reset Data</button><div>{review && <button type="button" disabled={pending} onClick={() => setReview(false)}>Edit brief</button>}<button type="button" disabled={pending} onClick={saveDraft}>Save as a draft</button><button className="lifestyle-form__submit" disabled={pending} type="submit">{pending ? 'Submitting…' : review ? 'Confirm & Send Project Enquiry →' : 'Review Enquiry →'}</button></div></footer>
      </>}
    </form>
  </section>
}
