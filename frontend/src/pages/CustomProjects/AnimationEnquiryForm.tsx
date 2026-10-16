import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { submitContactForm } from '../../api/contactApi'
import { getApiErrorMessage } from '../../lib/apiError'
import { ColorField, Choices, MultiChoices } from './LifestyleEnquiryForm'
import './lifestyle-enquiry.css'

const DRAFT_KEY = 'animation-enquiry-draft'
const EMPTY = { project: '', category: '', products: '1', durationRange: '', platforms: '', brief: '', motion: '', style: '', voiceOver: '', music: '', textCallouts: '', logoAnimation: '', exactDuration: '', resolution: '', aspect: '', fps: '', loop: '', transparent: '', color: '', formats: '', name: '', email: '' }
type Brief = typeof EMPTY
function readDraft(): Brief {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null')
    return Object.fromEntries(Object.entries(EMPTY).map(([key, value]) => [key, typeof saved?.[key] === 'string' ? saved[key] : value])) as Brief
  } catch { return { ...EMPTY } }
}
export function AnimationEnquiryForm({ onBack }: { onBack: () => void }) {
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
    if (next.some(file => !/\.(png|jpe?g|webp|gif|pdf|zip|mp4|mov|mp3|wav|svg|obj|fbx|glb|gltf|blend|stl|step)$/i.test(file.name))) { setError('Choose image, video, audio, 3D, PDF or ZIP files.'); return }
    setFiles(next); setError('')
  }
  const orNotSpecified = (value: string) => value || 'Not specified'
  const message = [
    'Service: 3D Product Animation', `Project: ${data.project || 'Untitled project'}`,
    `Product category: ${data.category}`, `Number of products: ${data.products}`,
    `Animation duration: ${orNotSpecified(data.durationRange)}`, `Intended platform: ${orNotSpecified(data.platforms)}`,
    `Animation brief: ${data.brief}`, `Animation type: ${orNotSpecified(data.motion)}`, `Style: ${orNotSpecified(data.style)}`,
    `Voice-over required: ${orNotSpecified(data.voiceOver)}`, `Music required: ${orNotSpecified(data.music)}`,
    `Text / callouts required: ${orNotSpecified(data.textCallouts)}`, `Logo animation required: ${orNotSpecified(data.logoAnimation)}`,
    `Exact video duration: ${orNotSpecified(data.exactDuration)}`, `Resolution: ${orNotSpecified(data.resolution)}`,
    `Aspect ratio: ${orNotSpecified(data.aspect)}`, `Frame rate: ${orNotSpecified(data.fps)}`,
    `Loop required: ${orNotSpecified(data.loop)}`, `Transparent background: ${orNotSpecified(data.transparent)}`,
    `Background color: ${orNotSpecified(data.color)}`, `Output formats: ${orNotSpecified(data.formats)}`,
    `Reference files to request by email: ${files.map(file => file.name).join(', ') || 'None'}`,
  ].join('\n')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('')
    if (!data.brief.trim()) { setError('Please describe the animation you want.'); return }
    if (!review) { setReview(true); return }
    if (data.name.trim().length < 2) { setError('Enter your full name (at least two characters).'); return }
    setPending(true)
    try {
      await submitContactForm({ name: data.name.trim(), email: data.email.trim(), subject: `3D product animation: ${data.project.trim() || data.category}`.slice(0, 200), message })
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
  return <section className="lifestyle-form" aria-label="3D product animation enquiry">
    <button type="button" className="lifestyle-form__back" onClick={onBack} disabled={pending}>← Back to services</button>
    <form onSubmit={submit}>
      <header><span className="lifestyle-form__icon" aria-hidden="true">◇</span><div><h2 ref={heading} tabIndex={-1}>{success ? 'Enquiry received' : review ? 'Review & Submit' : 'Add New Product Enquiry'}</h2><p>{success ? 'Our team will follow up by email.' : 'High-fidelity 3D product motion, camera choreography, feature reveals, explainer sequences, and commercial-grade animations.'}</p></div><span className="lifestyle-form__badge">✧ 3D Product Animation</span></header>
      {success ? <div className="lifestyle-form__success" role="status"><p>Your 3D Product Animation enquiry has been received for delivery.</p><button type="button" onClick={onBack}>Back to services</button></div> : <>
      {review ? <section className="lifestyle-form__section"><h3>Review your project</h3><pre className="lifestyle-form__review">{message}</pre><div className="lifestyle-form__grid"><label>Your name *{field('name', 'Your full name', 'text', true)}</label><label>Email address *{field('email', 'you@example.com', 'email', true)}</label></div><label className="lifestyle-form__privacy"><input type="checkbox" required /> I agree to the <Link to="/privacy" target="_blank">Privacy Policy</Link>.</label></section> : <>
      <section className="lifestyle-form__section"><h3>02 — PROJECT DETAILS</h3><div className="lifestyle-form__grid">
        <label>Project Name <span>(optional)</span>{field('project', 'e.g. Wireless Noise-Cancelling Headphones 3D Reveal')}</label>
        <label>Product Category <b>*</b><select required value={data.category} onChange={e => set('category', e.target.value)}><option value="">Search product category</option>{['Furniture', 'Home & Living', 'Beauty & Skincare', 'Fashion & Accessories', 'Electronics', 'Food & Beverage', 'Other'].map(category => <option key={category}>{category}</option>)}</select></label>
        <label>Number of products{field('products', '1', 'number', true)}</label>
        <Choices title="Animation duration" hint="(select primary)" options={['5–10 sec', '10–20 sec', '20–30 sec', '30–60 sec', 'Custom']} value={data.durationRange} onChange={v => set('durationRange', v)} />
        <div className="lifestyle-form__grid--full"><MultiChoices title="Intended platform" hint="(select all that apply)" options={['Website', 'Amazon', 'Instagram', 'YouTube', 'Advertising', 'Presentation']} value={data.platforms} onChange={v => set('platforms', v)} /></div>
      </div></section>
      <section className="lifestyle-form__section"><h3>03 — PROJECT BRIEF</h3>
        <label>Describe the animation you want<small>Explain the product movement, camera movement, features to highlight, visual style and desired sequence.</small><textarea required maxLength={2000} value={data.brief} onChange={e => set('brief', e.target.value)} placeholder="Explain the product movement, camera movement, features to highlight, visual style and desired sequence..." /></label>
        <Choices title="Animation type" hint="(select primary motion technique)" options={['Product rotation', 'Exploded view', 'Assembly', 'Feature demonstration', 'Technical animation', 'Cinematic product reveal', 'Logo reveal', 'Custom']} value={data.motion} onChange={v => set('motion', v)} />
        <Choices title="Style" hint="(select visual aesthetic)" options={['Photorealistic', 'Clean studio', 'Cinematic', 'Technical', 'Minimal', 'Commercial']} value={data.style} onChange={v => set('style', v)} />
        <h4 className="lifestyle-form__subhead">Scope & optional add-ons</h4>
        <div className="lifestyle-form__grid lifestyle-form__grid--three">
          <Choices title="Voice-over required?" options={yesNo} value={data.voiceOver} onChange={v => set('voiceOver', v)} />
          <Choices title="Music required?" options={yesNo} value={data.music} onChange={v => set('music', v)} />
          <Choices title="Text / callouts required?" options={yesNo} value={data.textCallouts} onChange={v => set('textCallouts', v)} />
          <Choices title="Logo animation required?" options={yesNo} value={data.logoAnimation} onChange={v => set('logoAnimation', v)} />
        </div>
      </section>
      <section className="lifestyle-form__section"><h3>04 — FILES</h3><small>Acceptable reference & animation assets:</small><div className="lifestyle-form__file-tags">{['3D models (OBJ / FBX / GLB / GLTF / BLEND)', 'CAD files (STEP / IGES / STL)', 'Product photos', 'Storyboard / moodboard', 'Reference video / link', 'Logo (AI / SVG / PNG)', 'Brand guidelines', 'Audio / voice-over', 'ZIP / Archives'].map(tag => <span key={tag}>{tag}</span>)}</div>
        <div className="lifestyle-form__drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}><strong>Choose file or Drag and drop image/video here</strong><small>Images, video, audio, 3D, PDF or ZIP files · up to 5 files, 20 MB each</small><button type="button" onClick={() => fileInput.current?.click()}>Browse files</button><input ref={fileInput} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.zip,.mp4,.mov,.mp3,.wav,.svg,.obj,.fbx,.glb,.gltf,.blend,.stl,.step" hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} /></div>
        <small>File names are included in your enquiry. Our team will contact you by email to collect the files.</small>
        {files.length > 0 && <ul className="lifestyle-form__files">{files.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}<button type="button" onClick={() => setFiles(current => current.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}>×</button></li>)}</ul>}
      </section>
      <section className="lifestyle-form__section"><h3>05 — REQUIREMENTS</h3>
        <div className="lifestyle-form__grid">
          <label>Exact video duration <span>(e.g. 15s, 30s or target length)</span>{field('exactDuration', 'e.g. 30 seconds')}</label>
          <Choices title="Resolution" hint="(select deliverable)" options={['1080p (FullHD)', '2K (QHD)', '4K (Ultra HD)']} value={data.resolution} onChange={v => set('resolution', v)} />
        </div>
        <div className="lifestyle-form__grid lifestyle-form__grid--three">
          <Choices title="Aspect ratio" hint="(select primary orientation)" options={['16:9 Landscape', '9:16 Vertical', '1:1 Square', 'Custom']} value={data.aspect} onChange={v => set('aspect', v)} />
          <label>FPS (frame rate)<select value={data.fps} onChange={e => set('fps', e.target.value)}><option value="">Select frame rate...</option>{['24 fps', '25 fps', '30 fps', '50 fps', '60 fps'].map(option => <option key={option}>{option}</option>)}</select></label>
          <div><ColorField id="animation-background-color" value={data.color} onChange={value => set('color', value)} /></div>
        </div>
        <div className="lifestyle-form__grid">
          <Choices title="Loop required?" options={['No', '360° loop']} value={data.loop} onChange={v => set('loop', v)} />
          <Choices title="Transparent background?" options={['No', 'Alpha transparent']} value={data.transparent} onChange={v => set('transparent', v)} />
        </div>
        <MultiChoices title="Output format" hint="(select all deliverables needed)" options={['MP4 (H.264 / universal)', 'MOV (ProRes / alpha)', 'WebM (web transparent)', 'GIF (animated preview)']} value={data.formats} onChange={v => set('formats', v)} />
      </section>
      </>}
      {error && <p className="lifestyle-form__error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      <footer><button type="button" disabled={pending} onClick={() => { setData({ ...EMPTY }); setFiles([]); setReview(false); setError(''); setNotice(''); try { localStorage.removeItem(DRAFT_KEY) } catch { /* Storage may be unavailable. */ } }}>Reset Data</button><div>{review && <button type="button" disabled={pending} onClick={() => setReview(false)}>Edit brief</button>}<button type="button" disabled={pending} onClick={saveDraft}>Save as a draft</button><button className="lifestyle-form__submit" disabled={pending} type="submit">{pending ? 'Submitting…' : review ? 'Submit Enquiry →' : 'Review Enquiry →'}</button></div></footer>
      </>}
    </form>
  </section>
}
