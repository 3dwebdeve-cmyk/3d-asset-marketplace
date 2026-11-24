import { useCallback, useEffect, useRef, useState } from 'react'
import { BriefProjectDetails } from './BriefProjectDetails'

const services = [
  ['Product 3D modeling', 'Accurate models from photos, CAD or sketches.', 'AI product 3D Model.', 'chair'],
  ['Product renders', 'Studio and marketplace images on white or colour.', 'AI product render.', 'bottles'],
  ['Lifestyle and scene renders', 'Your product placed in a styled environment.', 'AI lifestyle and scene render.', 'sofa'],
  ['Furniture visualization', 'Room sets, material variants, catalogues.', 'AI furniture visuals.', 'table'],
  ['Packaging design', 'Pack mockups, dielines and shelf visuals.', 'AI packaging mockups.', 'packaging'],
  ['3D animation', 'Product spins, explainers and ad films.', 'AI product videos.', 'animation'],
  ['AR and Web3D assets', 'Optimised models for viewers and configurators.', 'AI-generated 3D assets.', 'headset'],
  ['Something else', 'Not listed? Describe it and we’ll scope it.', '', 'spheres'],
] as const

export function BriefServiceSelector({ compact = false }: { compact?: boolean }) {
  const [selected, setSelected] = useState<string[]>([])
  const [step, setStep] = useState(0)
  const [resetVersion, setResetVersion] = useState(0)
  const serviceHeading = useRef<HTMLHeadingElement>(null)
  const resetEnquiry = useCallback(() => {
    setSelected([])
    setStep(0)
    setResetVersion(current => current + 1)
  }, [])
  useEffect(() => {
    if (resetVersion) {
      serviceHeading.current?.focus({ preventScroll: true })
      serviceHeading.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    }
  }, [resetVersion])
  return <section className={`brief-selector-wrap${compact ? ' brief-selector-wrap--compact' : ''}`} aria-label={compact ? 'Project enquiry' : undefined} aria-labelledby={compact ? undefined : 'brief-selector-heading'}>
    <div className="brief-selector">
      {!compact && <h2 id="brief-selector-heading">Brief the Hive. Get a Price and timeline in 16 hours.</h2>}
      <ol className="brief-selector-steps" aria-label="Enquiry steps">
        {['Service', 'Project details', 'Your contact'].map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}
      </ol>
      <div hidden={step !== 0}><h3 ref={serviceHeading} tabIndex={-1}>What do you need?</h3>
      <p className="brief-selector-help">{compact ? 'Choose one or more. We’ll suggest matching options on the next step.' : 'Choose one or more services for your project.'}</p>
      <div className="brief-selector-grid">
        {services.map(([title, description, ai, image]) => <label className="brief-selector-card" key={title}>
          <input type="checkbox" checked={selected.includes(title)} onChange={() => setSelected(current => current.includes(title) ? current.filter(value => value !== title) : [...current, title])} />
          {!compact && <img src={`/images/brief-services/${image}.webp`} alt="" loading="lazy" width="180" height="130" />}
          <span className="brief-selector-title">{title}</span><span className="brief-selector-description">{description}{ai && <> <span className="brief-selector-ai">{ai}</span></>}</span>
        </label>)}
      </div>
      <div className="brief-selector-actions"><span role="status">{selected.length} {selected.length === 1 ? 'service' : 'services'} selected</span><button disabled={!selected.length} onClick={() => setStep(1)}>Continue <span aria-hidden="true">→</span></button></div></div>
      <BriefProjectDetails key={resetVersion} step={step} setStep={setStep} onReset={resetEnquiry} services={services.filter(([title]) => selected.includes(title))} />
    </div>
  </section>
}
