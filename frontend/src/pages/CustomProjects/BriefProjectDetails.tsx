import { useEffect, useRef, useState, type FormEvent } from 'react'
import { submitContactForm } from '../../api/contactApi'
import { getApiErrorMessage } from '../../lib/apiError'

const purposes = ['Marketing renders', 'Marketplace images', 'E-commerce site', 'AR try-on', 'Web 3D viewer', 'Configurator', 'Catalogue or print', 'Video or ad', '3D printing', 'Game or real-time']
const formats = ['JPG / PNG', 'PSD layered', 'PDF', 'MP4', 'GIF', 'GLB / GLTF', 'USDZ', 'FBX', 'OBJ', 'STEP / CAD', 'Native file (Blend / Max)', 'Other']
function ReferenceFilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!/\.(png|jpe?g|webp|gif)$/i.test(file.name)) return
    const preview = URL.createObjectURL(file)
    setUrl(preview)
    return () => URL.revokeObjectURL(preview)
  }, [file])
  return <>{url ? <img className="brief-file-thumbnail" src={url} alt={`Preview of ${file.name}`} /> : <span className="brief-file-type" aria-label={file.name}>{file.name.split('.').pop()?.toUpperCase()}</span>}</>
}
function Chips({ title, help, values, selected, onChange }: {title:string;help:string;values:string[];selected:string[];onChange:(value:string[])=>void}) {
  return <fieldset className={`brief-detail-chips${title === 'Purpose' ? ' brief-purpose-chips' : ''}`}><legend>{title}</legend><p>{help}</p><div>{values.map(value => <label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={() => onChange(selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value])} /><span>{value}</span></label>)}</div></fieldset>
}
export function BriefProjectDetails({step, setStep, onReset, services}:{step:number;setStep:(step:number)=>void;onReset:()=>void;services:readonly (readonly [string,string,string])[]}) {
  const [scope, setScope] = useState('')
  const [specs, setSpecs] = useState('')
  const [purpose, setPurpose] = useState<string[]>([])
  const [output, setOutput] = useState<string[]>([])
  const [links, setLinks] = useState('')
  const [budget, setBudget] = useState('Not sure yet')
  const [delivery, setDelivery] = useState('Flexible')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  useEffect(() => {
    if (!sent) return
    const timer = window.setTimeout(onReset, 2000)
    return () => window.clearTimeout(timer)
  }, [sent, onReset])
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (step) { heading.current?.focus(); heading.current?.scrollIntoView?.({block:'nearest', behavior:'smooth'}) } }, [step])
  function addFiles(incoming: FileList | null) {
    const next = [...files, ...Array.from(incoming ?? [])]
    if(next.length > 10 || next.reduce((total,file)=>total+file.size,0) > 10 * 1024 * 1024) {setError('Choose up to 10 files, totalling no more than 10 MB.'); return}
    if(next.some(file => !/\.(png|jpe?g|webp|gif|pdf|obj|fbx|glb|gltf|blend|stl|step|stp|iges|igs|zip)$/i.test(file.name))) {setError('Choose images, PDF, CAD, 3D or ZIP files.'); return}
    setFiles(next); setError('')
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setPending(true);setError('')
    try {
      await submitContactForm({name:String(data.get('name')),email:String(data.get('email')),subject:'Custom project enquiry',attachments:files,
        message:[`Selected services: ${services.map(([title])=>title).join(', ')}`,`Scope of work: ${scope}`,`Specifications and guidelines: ${specs}`,`Purpose: ${purpose.join(', ')}`,`Output formats: ${output.join(', ')}`,`Briefs and links: ${links}`,`Budget range: ${budget}`,`Delivery time: ${delivery}`,`Company: ${data.get('company')}`,`Phone: ${data.get('phone')}`,`NDA requested: ${data.get('nda') ? 'Yes' : 'No'}`,`30% payment acknowledgement: ${data.get('paymentAcknowledged') ? 'Confirmed' : 'Not confirmed'}`].join('\n\n')})
      setSent(true)
    } catch(e) {setError(getApiErrorMessage(e, 'We could not send your enquiry. Please try again.'))} finally {setPending(false)}
  }
  return <div hidden={step === 0} className="brief-detail-layout">
    <div className="brief-detail-main">
      <h3 ref={heading} tabIndex={-1}>{step === 1 ? 'Describe your project' : sent ? 'Thank you for your enquiry' : 'Your contact details'}</h3>
      <div hidden={step !== 1}>
        <div className="brief-detail-grid brief-detail-grid--project">
          <label className="brief-detail-field">Scope of work<small>What should we make, and how many items, scenes or variations?</small><textarea value={scope} onChange={e=>setScope(e.target.value)} placeholder="e.g. 40 SKUs of bottled products: 3D models plus 5 marketplace images each." /></label>
          <Chips title="Purpose" help="Where will the final result be used?" values={purposes} selected={purpose} onChange={setPurpose}/>
          <Chips title="Output formats" help="Select all you need. Not sure? Leave blank and we’ll advise." values={formats} selected={output} onChange={setOutput}/>
          <div className="brief-detail-field"><label htmlFor="brief-reference-files">Reference images</label><label className="brief-detail-drop" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addFiles(e.dataTransfer.files)}}><input id="brief-reference-files" type="file" multiple accept="image/*,.pdf,.zip,.obj,.fbx,.glb,.gltf,.blend,.stl,.step,.stp,.iges,.igs" onChange={e=>{addFiles(e.target.files);e.target.value=''}}/><span>Drop files here or click to browse</span><small>Images, PDFs or CAD, up to 10 files (10 MB total)</small></label>{files.length ? <ul className="brief-file-list">{files.map((file,index)=><li key={`${file.name}-${index}`}><ReferenceFilePreview file={file}/><button type="button" aria-label={`Remove ${file.name}`} onClick={()=>setFiles(current=>current.filter((_,i)=>i!==index))}>×</button></li>)}</ul> : <small>No files selected.</small>}</div>
          <label className="brief-detail-field">Specifications and guidelines<small>Dimensions, materials, brand colours, camera angles, resolution, polycount, platform limits.</small><textarea value={specs} onChange={e=>setSpecs(e.target.value)} /></label>
          <label className="brief-detail-field">Briefs and links<small>Paste a brief, or links to a folder, Figma, Drive or a product page.</small><textarea value={links} onChange={e=>setLinks(e.target.value)} /></label>
          <label className="brief-detail-field">Budget range<select value={budget} onChange={e=>setBudget(e.target.value)}>{['Not sure yet', 'Under $500', '$500–$1,000', '$1,000–$5,000', '$5,000–$10,000', '$10,000+'].map(value=><option key={value}>{value}</option>)}</select></label>
          <label className="brief-detail-field">Delivery time<select value={delivery} onChange={e=>setDelivery(e.target.value)}>{['Flexible', 'Within 1 week', 'Within 2 weeks', 'Within 1 month', 'More than 1 month'].map(value=><option key={value}>{value}</option>)}</select></label>
        </div>
        <div className="brief-detail-actions"><button type="button" onClick={()=>setStep(0)}>Back</button><button type="button" onClick={()=>{setError('');setStep(2)}}>Continue →</button></div>
      </div>
      {step===2 && (sent ? <p role="status">Your brief has been sent. A producer will review your project and reply with the next steps.</p> : <form onSubmit={submit}><div className="brief-detail-grid"><label className="brief-detail-field">Name<input name="name" required minLength={2} maxLength={120} autoComplete="name" /></label><label className="brief-detail-field">Email<input type="email" name="email" required autoComplete="email" /></label><label className="brief-detail-field">Company (optional)<input name="company" autoComplete="organization" /></label><label className="brief-detail-field">Phone (optional)<input type="tel" name="phone" autoComplete="tel" /></label></div><label className="brief-detail-consent"><input type="checkbox" name="nda"/>I&rsquo;d like an NDA signed before I share files.</label><label className="brief-detail-consent"><input type="checkbox" name="paymentAcknowledged" required/>I understand work starts once the 30% payment is confirmed.</label><div className="brief-detail-actions"><button type="button" disabled={pending} onClick={()=>setStep(1)}>Back</button><button type="submit" disabled={pending}>{pending?'Sending…':'Send enquiry →'}</button></div></form>)}
      {error && <p role="alert" className="brief-detail-error">{error}</p>}
    </div>
  </div>
}
