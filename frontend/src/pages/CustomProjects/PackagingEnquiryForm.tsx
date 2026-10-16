import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { submitContactForm } from '../../api/contactApi'
import { getApiErrorMessage } from '../../lib/apiError'
import { ColorField, Choices, MultiChoices } from './LifestyleEnquiryForm'
import './lifestyle-enquiry.css'

const DRAFT_KEY = 'packaging-enquiry-draft'
const EMPTY = { project: '', category: '', designs: '1', packagingType: '', intendedUse: '', concept: '', packagingStyle: '', material: '', needDieline: '', need3dMockup: '', needRenders: '', width: '', height: '', depth: '', views: '', finish: '', color: '', outputResolution: '', formats: '', name: '', email: '' }
type Brief = typeof EMPTY
function readDraft(): Brief {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null')
    return Object.fromEntries(Object.entries(EMPTY).map(([key, value]) => [key, typeof saved?.[key] === 'string' ? saved[key] : value])) as Brief
  } catch { return { ...EMPTY } }
}
export function PackagingEnquiryForm({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<Brief>(readDraft)
  const [files, setFiles] = useState<File[]>([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [review, setReview] = useState(false)
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)
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
    'Service: Packaging Design', `Project: ${data.project || 'Untitled project'}`,
    `Product category: ${data.category}`, `Number of designs: ${data.designs}`,
    `Packaging type: ${orNotSpecified(data.packagingType)}`, `Intended use: ${orNotSpecified(data.intendedUse)}`,
    `Packaging concept: ${data.concept}`, `Packaging style: ${orNotSpecified(data.packagingStyle)}`,
    `Material: ${orNotSpecified(data.material)}`,
    `Packaging dieline needed: ${orNotSpecified(data.needDieline)}`, `3D mockup needed: ${orNotSpecified(data.need3dMockup)}`,
    `Photorealistic renders needed: ${orNotSpecified(data.needRenders)}`,
    `Width: ${orNotSpecified(data.width)}`, `Height: ${orNotSpecified(data.height)}`, `Depth / diameter: ${orNotSpecified(data.depth)}`,
    `Number of views / renders: ${orNotSpecified(data.views)}`, `Finish: ${orNotSpecified(data.finish)}`,
    `Background color: ${orNotSpecified(data.color)}`, `Output resolution: ${orNotSpecified(data.outputResolution)}`,
    `File formats: ${orNotSpecified(data.formats)}`,
    `Reference files to request by email: ${files.map(file => file.name).join(', ') || 'None'}`,
  ].join('\n')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('')
    if (!data.concept.trim()) { setError('Please describe your packaging concept.'); return }
    if (!review) { setReview(true); return }
    if (data.name.trim().length < 2) { setError('Enter your full name (at least two characters).'); return }
    setPending(true)
    try {
      await submitContactForm({ name: data.name.trim(), email: data.email.trim(), subject: `Packaging design: ${data.project.trim() || data.category}`.slice(0, 200), message })
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* Submission still succeeded. */ }
      setSuccess(true)
    } catch (err) { setError(getApiErrorMessage(err, 'Could not send your enquiry. Please try again.')) }
    finally { setPending(false) }
  }
  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); setNotice('Draft saved on this device. Selected files must be chosen again when you return.'); setError('') }
    catch { setError('Your browser could not save this draft. Keep this page open to preserve your details.') }
  }
  const field = (key: keyof Brief, placeholder = '', type = 'text', required = false) => <input type={type} value={data[key]} onChange={event => set(key, event.target.value)} placeholder={placeholder} required={required} maxLength={key === 'name' ? 120 : key === 'email' ? 254 : 160} {...(type === 'number' ? { min: 1, max: 10000, step: 1 } : {})} />
  const yesNo = ['Yes', 'No']
  return <section className="lifestyle-form" aria-label="Packaging design enquiry">
    <button type="button" className="lifestyle-form__back" onClick={onBack} disabled={pending}>← Back to services</button>
    <form onSubmit={submit}>
      <header><span className="lifestyle-form__icon" aria-hidden="true">◇</span><div><h2 ref={heading} tabIndex={-1}>{success ? 'Enquiry received' : review ? 'Review & Submit' : 'Add New Product Enquiry'}</h2><p>{success ? 'Our team will follow up by email.' : 'Customise packaging dimensions, structure, dielines, materials, finishes, and brand direction.'}</p></div><span className="lifestyle-form__badge">✧ Packaging Design</span></header>
      {success ? <div className="lifestyle-form__success" role="status"><p>Your Packaging Design enquiry has been received for delivery.</p><button type="button" onClick={onBack}>Back to services</button></div> : <>
      {review ? <section className="lifestyle-form__section"><h3>Review your project</h3><pre className="lifestyle-form__review">{message}</pre><div className="lifestyle-form__grid"><label>Your name *{field('name', 'Your full name', 'text', true)}</label><label>Email address *{field('email', 'you@example.com', 'email', true)}</label></div><label className="lifestyle-form__privacy"><input type="checkbox" required /> I agree to the <Link to="/privacy" target="_blank">Privacy Policy</Link>.</label></section> : <>
      <section className="lifestyle-form__section"><h3>02 — PROJECT DETAILS</h3><div className="lifestyle-form__grid">
        <label>Project Name <span>(optional)</span>{field('project', 'e.g. Premium Health Cosmetic Box')}</label>
        <label>Product Category <b>*</b><select required value={data.category} onChange={e => set('category', e.target.value)}><option value="">Search product category</option>{['Furniture', 'Home & Living', 'Beauty & Skincare', 'Fashion & Accessories', 'Electronics', 'Food & Beverage', 'Other'].map(category => <option key={category}>{category}</option>)}</select></label>
        <label>Number of designs{field('designs', '1', 'number', true)}</label>
        <Choices title="Packaging type" hint="(select structure)" options={['Box', 'Bottle', 'Jar', 'Pouch', 'Tube', 'Can', 'Custom']} value={data.packagingType} onChange={v => set('packagingType', v)} />
        <div className="lifestyle-form__grid--full"><Choices title="Intended use" hint="(select one)" options={['Presentation', 'Website', 'Advertising', 'Amazon', 'Print preview', 'Animation']} value={data.intendedUse} onChange={v => set('intendedUse', v)} /></div>
      </div></section>
      <section className="lifestyle-form__section"><h3>03 — PROJECT BRIEF</h3>
        <label>Describe the packaging concept<small>Tell us about the product, packaging style, brand direction, materials and visual references.</small><textarea required maxLength={2000} value={data.concept} onChange={e => set('concept', e.target.value)} placeholder="Tell us about the product, packaging style, brand direction, materials and visual references..." /></label>
        <div className="lifestyle-form__grid">
          <Choices title="Packaging style" hint="(select style)" options={['Minimal', 'Luxury', 'Modern', 'Organic', 'Premium', 'Playful', 'Custom']} value={data.packagingStyle} onChange={v => set('packagingStyle', v)} />
          <MultiChoices title="Material" hint="(select packaging substrate)" options={['Cardboard', 'Plastic', 'Glass', 'Metal', 'Paper', 'Other']} value={data.material} onChange={v => set('material', v)} />
        </div>
        <h4 className="lifestyle-form__subhead">Scope & deliverable services</h4>
        <div className="lifestyle-form__grid lifestyle-form__grid--three">
          <Choices title="Need packaging dieline?" options={yesNo} value={data.needDieline} onChange={v => set('needDieline', v)} />
          <Choices title="Need 3D mockup?" options={yesNo} value={data.need3dMockup} onChange={v => set('need3dMockup', v)} />
          <Choices title="Need photorealistic renders?" options={yesNo} value={data.needRenders} onChange={v => set('needRenders', v)} />
        </div>
      </section>
      <section className="lifestyle-form__section"><h3>04 — FILES</h3><small>Acceptable reference & branding assets:</small><div className="lifestyle-form__file-tags">{['Online (AI / PDF / EPS)', 'Logo', 'Labels', 'Brand guidelines', 'Product information', 'Packaging artwork', 'Reference images', 'Dimensions', 'ZIP / Archives'].map(tag => <span key={tag}>{tag}</span>)}</div>
        <div className="lifestyle-form__drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}><strong>Choose file or Drag and drop packaging assets here</strong><small>Images, PDF or ZIP files · up to 5 files, 20 MB each</small><button type="button" onClick={() => fileInput.current?.click()}>Browse files</button><input ref={fileInput} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.zip" hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} /></div>
        <small>File names are included in your enquiry. Our team will contact you by email to collect the files.</small>
        {files.length > 0 && <ul className="lifestyle-form__files">{files.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}<button type="button" onClick={() => setFiles(current => current.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}>×</button></li>)}</ul>}
      </section>
      <section className="lifestyle-form__section"><h3>05 — REQUIREMENTS</h3>
        <div className="lifestyle-form__grid lifestyle-form__grid--three">
          <label>Package width (mm / in){field('width', 'e.g. 100 mm')}</label>
          <label>Height (mm / in){field('height', 'e.g. 190 mm')}</label>
          <label>Depth / diameter (mm / in){field('depth', 'e.g. 50 mm')}</label>
        </div>
        <div className="lifestyle-form__grid lifestyle-form__grid--three">
          <label>Number of views / renders{field('views', 'e.g. 2', 'number')}</label>
          <MultiChoices title="Finish" hint="(select surface treatment)" options={['Matte', 'Gloss', 'Metallic', 'Embossed', 'Foil stamped', 'Custom']} value={data.finish} onChange={v => set('finish', v)} />
          <div><ColorField id="packaging-background-color" value={data.color} onChange={value => set('color', value)} /></div>
        </div>
        <div className="lifestyle-form__grid">
          <Choices title="Output resolution" options={['2K', '4K', '8K', 'Print 300 DPI']} value={data.outputResolution} onChange={v => set('outputResolution', v)} />
          <MultiChoices title="File formats" hint="(select all needed)" options={['AI / PDF', 'PSD', 'PNG / JPG', 'GLB / GLTF']} value={data.formats} onChange={v => set('formats', v)} />
        </div>
      </section>
      </>}
      {error && <p className="lifestyle-form__error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      <footer><button type="button" disabled={pending} onClick={() => { setData({ ...EMPTY }); setFiles([]); setReview(false); setError(''); setNotice(''); try { localStorage.removeItem(DRAFT_KEY) } catch { /* Storage may be unavailable. */ } }}>Reset Data</button><div>{review && <button type="button" disabled={pending} onClick={() => setReview(false)}>Edit brief</button>}<button type="button" disabled={pending} onClick={saveDraft}>Save as a draft</button><button className="lifestyle-form__submit" disabled={pending} type="submit">{pending ? 'Submitting…' : review ? 'Submit Enquiry →' : 'Review Enquiry →'}</button></div></footer>
      </>}
    </form>
  </section>
}
