import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { submitContactForm } from '../../api/contactApi'
import { getApiErrorMessage } from '../../lib/apiError'
import { ColorField, Choices, MultiChoices } from './LifestyleEnquiryForm'
import './lifestyle-enquiry.css'

const DRAFT_KEY = 'product-images-enquiry-draft'
const EMPTY = { project: '', category: '', products: '1', imagesPerProduct: '1', platform: '', types: '', direction: '', style: '', orientation: '', backgroundStyle: '', formats: '', color: '', deadline: '', reflection: '', retouching: '', colorCorrection: '', blending: '', shadow: '', avoid: '', name: '', email: '' }
type Brief = typeof EMPTY
function readDraft(): Brief {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null')
    return Object.fromEntries(Object.entries(EMPTY).map(([key, value]) => [key, typeof saved?.[key] === 'string' ? saved[key] : value])) as Brief
  } catch { return { ...EMPTY } }
}
const SELECT_OPTIONS = {
  style: ['Photorealistic', 'Clean & minimal', 'Premium', 'Bold & creative', 'Custom'],
  orientation: ['Square (1:1)', 'Portrait (4:5 / 9:16)', 'Landscape (16:9)', 'Multiple formats'],
  backgroundStyle: ['Plain colour', 'Soft gradient', 'Textured surface', 'Lifestyle setting', 'Transparent (cut-out)'],
}
export function ProductImagesEnquiryForm({ onBack }: { onBack: () => void }) {
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
  const yesNo = (value: string) => value || 'Not specified'
  const message = [
    'Service: Product Images', `Project: ${data.project || 'Untitled project'}`,
    `Product category: ${data.category}`, `Products: ${data.products}`, `Images per product: ${data.imagesPerProduct}`,
    `Platform: ${yesNo(data.platform)}`, `Image types: ${yesNo(data.types)}`,
    `Creative direction: ${yesNo(data.direction)}`, `Style: ${yesNo(data.style)}`, `Orientation: ${yesNo(data.orientation)}`,
    `Background style: ${yesNo(data.backgroundStyle)}`, `Output formats: ${yesNo(data.formats)}`,
    `Background color: ${yesNo(data.color)}`, `Deadline: ${yesNo(data.deadline)}`,
    `Reflection required: ${yesNo(data.reflection)}`, `Retouching required: ${yesNo(data.retouching)}`,
    `Color correction required: ${yesNo(data.colorCorrection)}`, `Blending / text required: ${yesNo(data.blending)}`,
    `Shadow required: ${yesNo(data.shadow)}`, `Avoid: ${yesNo(data.avoid)}`,
    `Reference files to request by email: ${files.map(file => file.name).join(', ') || 'None'}`,
  ].join('\n')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('')
    if (!data.types.trim()) { setError('Please choose at least one image type.'); return }
    if (!review) { setReview(true); return }
    if (data.name.trim().length < 2) { setError('Enter your full name (at least two characters).'); return }
    setPending(true)
    try {
      await submitContactForm({ name: data.name.trim(), email: data.email.trim(), subject: `Product images: ${data.project.trim() || data.category}`.slice(0, 200), message })
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
  return <section className="lifestyle-form" aria-label="Product images enquiry">
    <button type="button" className="lifestyle-form__back" onClick={onBack} disabled={pending}>← Back to services</button>
    <form onSubmit={submit}>
      <header><span className="lifestyle-form__icon" aria-hidden="true">◇</span><div><h2 ref={heading} tabIndex={-1}>{success ? 'Enquiry received' : review ? 'Review & Submit' : 'Add New Product Enquiry'}</h2><p>{success ? 'Our team will follow up by email.' : 'Main purpose: clean product visuals, advertising images and background replacement.'}</p></div><span className="lifestyle-form__badge">✧ Product Images</span></header>
      {success ? <div className="lifestyle-form__success" role="status"><p>Your Product Images enquiry has been received for delivery.</p><button type="button" onClick={onBack}>Back to services</button></div> : <>
      {review ? <section className="lifestyle-form__section"><h3>Review your project</h3><pre className="lifestyle-form__review">{message}</pre><div className="lifestyle-form__grid"><label>Your name *{field('name', 'Your full name', 'text', true)}</label><label>Email address *{field('email', 'you@example.com', 'email', true)}</label></div><label className="lifestyle-form__privacy"><input type="checkbox" required /> I agree to the <Link to="/privacy" target="_blank">Privacy Policy</Link>.</label></section> : <>
      <section className="lifestyle-form__section"><h3>02 — PROJECT DETAILS</h3><div className="lifestyle-form__grid">
        <label>Project Name <span>(optional)</span>{field('project', 'e.g. Summer Skincare Campaign')}</label>
        <label>Product Category <b>*</b><select required value={data.category} onChange={e => set('category', e.target.value)}><option value="">Search product category</option>{['Furniture', 'Home & Living', 'Beauty & Skincare', 'Fashion & Accessories', 'Electronics', 'Food & Beverage', 'Other'].map(category => <option key={category}>{category}</option>)}</select></label>
        <div className="lifestyle-form__grid"><label>Number of products{field('products', '1', 'number', true)}</label><label>Images required per product{field('imagesPerProduct', '1', 'number', true)}</label></div>
        <Choices title="Target platform" hint="(select one)" options={['Website', 'Amazon', 'Shopify', 'Social Media', 'Advertising', 'Print', 'Other']} value={data.platform} onChange={v => set('platform', v)} />
      </div></section>
      <section className="lifestyle-form__section"><h3>03 — PROJECT BRIEF</h3>
        <MultiChoices title="What type of product images do you need?" hint="(select all that apply)" options={['White background', 'Transparent background', 'Studio background', 'Gradient background', 'Lifestyle background', 'Creative advertising image', 'Product shadow / reflection', 'Multiple variations']} value={data.types} onChange={v => set('types', v)} />
        <label>Creative direction & composition<small>Describe the desired background, lighting, composition, image style, and product presentation.</small><textarea maxLength={2000} value={data.direction} onChange={e => set('direction', e.target.value)} placeholder="Describe the desired background, lighting, composition, image style, and product presentation..." /></label>
        <div className="lifestyle-form__grid lifestyle-form__grid--three">
          <label>Preferred style<select value={data.style} onChange={e => set('style', e.target.value)}><option value="">Select style...</option>{SELECT_OPTIONS.style.map(option => <option key={option}>{option}</option>)}</select></label>
          <label>Image orientation<select value={data.orientation} onChange={e => set('orientation', e.target.value)}><option value="">Select orientation...</option>{SELECT_OPTIONS.orientation.map(option => <option key={option}>{option}</option>)}</select></label>
          <label>Background style<select value={data.backgroundStyle} onChange={e => set('backgroundStyle', e.target.value)}><option value="">Select background style...</option>{SELECT_OPTIONS.backgroundStyle.map(option => <option key={option}>{option}</option>)}</select></label>
        </div>
        <MultiChoices title="Required output format" hint="(select all needed)" options={['JPG', 'PNG', 'WEBP', 'PSD (layered)']} value={data.formats} onChange={v => set('formats', v)} />
      </section>
      <section className="lifestyle-form__section"><h3>04 — FILES</h3><small>Acceptable reference files:</small><div className="lifestyle-form__file-tags">{['Product views', 'Side / back views', 'Packaging', 'Logo', 'Reference images', 'ZIP / Archives'].map(tag => <span key={tag}>{tag}</span>)}</div>
        <p className="lifestyle-form__tip">Tip: high-resolution product photos give significantly sharper results. Use clean, well-lit shots where possible.</p>
        <div className="lifestyle-form__drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}><strong>Choose file or Drag and drop image here</strong><small>Images, PDF or ZIP files · up to 5 files, 20 MB each</small><button type="button" onClick={() => fileInput.current?.click()}>Browse files</button><input ref={fileInput} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.zip" hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} /></div>
        <small>File names are included in your enquiry. Our team will contact you by email to collect the files.</small>
        {files.length > 0 && <ul className="lifestyle-form__files">{files.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}<button type="button" onClick={() => setFiles(current => current.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}>×</button></li>)}</ul>}
      </section>
      <section className="lifestyle-form__section"><h3>05 — REQUIREMENTS</h3><div className="lifestyle-form__grid lifestyle-form__grid--three"><div><ColorField id="product-background-color" value={data.color} onChange={value => set('color', value)} /></div><label>Deadline{field('deadline', '', 'date')}</label><label>Specific things to avoid{field('avoid', 'e.g. No harsh shadows, no glare')}</label></div>
        <div className="lifestyle-form__grid lifestyle-form__grid--three">
          <Choices title="Reflection required?" options={['Yes', 'No']} value={data.reflection} onChange={v => set('reflection', v)} />
          <Choices title="Retouching required?" options={['Yes', 'No']} value={data.retouching} onChange={v => set('retouching', v)} />
          <Choices title="Color correction required?" options={['Yes', 'No']} value={data.colorCorrection} onChange={v => set('colorCorrection', v)} />
          <Choices title="Blending / text required?" options={['Yes', 'No']} value={data.blending} onChange={v => set('blending', v)} />
          <Choices title="Shadow required?" options={['Yes', 'No']} value={data.shadow} onChange={v => set('shadow', v)} />
        </div></section>
      </>}
      {error && <p className="lifestyle-form__error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      <footer><button type="button" disabled={pending} onClick={() => { setData({ ...EMPTY }); setFiles([]); setReview(false); setError(''); setNotice(''); try { localStorage.removeItem(DRAFT_KEY) } catch { /* Storage may be unavailable. */ } }}>Reset Data</button><div>{review && <button type="button" disabled={pending} onClick={() => setReview(false)}>Edit brief</button>}<button type="button" disabled={pending} onClick={saveDraft}>Save as a draft</button><button className="lifestyle-form__submit" disabled={pending} type="submit">{pending ? 'Submitting…' : review ? 'Submit Enquiry →' : 'Review Enquiry →'}</button></div></footer>
      </>}
    </form>
  </section>
}
