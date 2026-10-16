import { useState } from 'react'
import { Link } from 'react-router-dom'

import './custom-project-services.css'
import { LifestyleEnquiryForm } from './LifestyleEnquiryForm'
import { ProductImagesEnquiryForm } from './ProductImagesEnquiryForm'
import { ModelingEnquiryForm } from './ModelingEnquiryForm'
import { PackagingEnquiryForm } from './PackagingEnquiryForm'
import { AnimationEnquiryForm } from './AnimationEnquiryForm'

const SERVICES = [
  { title: 'Lifestyle & Product Renders', description: 'Photorealistic scene renders.', image: '/custome project image/coffee_machine_264x200.png' },
  { title: 'Product Images', description: 'Clean, high-quality product photos.', image: '/custome project image/chair_264x200.png', imagePosition: 'top center' },
  { title: '3D Modeling', description: 'Accurate, production-ready models.', image: '/custome project image/character_modeling_264x200.png' },
  { title: 'Packaging Design', description: 'Custom 3D packaging and box design.', image: '/custome project image/packaging_design_264x200.png' },
  { title: '3D Product Animation', description: 'Engaging animations and explainers.', image: '/images/custom-render.webp', visual: 'animation' },
  { title: 'Furniture Visualization', description: 'Realistic furniture and room setups.', image: '/custome project image/yellow_chair_resized_264x200.png' },
  { title: 'Marketplace Ready Package', description: 'Optimised assets for Amazon and more.', visual: 'marketplace' },
  { title: 'Other / Custom Service', description: 'Have a different requirement? Tell us.', visual: 'other' },
]

type EnquiryForm = 'lifestyle' | 'product' | 'modeling' | 'packaging' | 'animation'
// Services that open a detailed enquiry form when selected.
const ENQUIRY_FORMS: Partial<Record<string, EnquiryForm>> = {
  [SERVICES[0].title]: 'lifestyle',
  [SERVICES[1].title]: 'product',
  [SERVICES[2].title]: 'modeling',
  [SERVICES[3].title]: 'packaging',
  [SERVICES[4].title]: 'animation',
}

function ServiceVisual({ service }: { service: (typeof SERVICES)[number] }) {
  if (service.image) return <><img src={service.image} alt="" loading="lazy" style={{ objectPosition: 'imagePosition' in service ? service.imagePosition : undefined }} />{service.visual === 'animation' && <span className="project-services__play">▶</span>}</>
  if (service.visual === 'marketplace') return <span className="project-services__marketplace" aria-hidden="true">a<svg viewBox="0 0 70 25"><path d="M8 7Q35 28 61 5M50 5l13-2-2 12" /></svg></span>
  if (service.visual === 'other') return <span className="project-services__dots" aria-hidden="true">•••</span>
  if (service.visual === 'package') return <svg className="project-services__package" viewBox="0 0 100 90" aria-hidden="true"><path fill="#3977ae" d="m15 23 39-12 32 14-39 13z" /><path fill="#235780" d="m15 23 32 15v39L15 61z" /><path fill="#173f64" d="m47 38 39-13v38L47 77z" /><path d="m34 17 33 14v14" fill="none" stroke="#84b6df" strokeWidth="3" /><text x="25" y="54" fill="#d9eafa" fontSize="20">B</text></svg>
  return <svg className="project-services__model" viewBox="0 0 100 90" aria-hidden="true"><path d="m27 45 5-30 35-4 7 31M27 45l-10 9 38 9 25-14-6-7-33 8zM17 54l3 25M55 63l2 20M80 49l-2 26M30 58l-2 16M32 15l9 35M43 14l8 33M55 12l7 33M29 27l41-4M28 37l43-4M23 49l38 9M32 47l39 6M22 55l26-12M36 59l28-14" /></svg>
}

export function CustomProjectServices({ onFormOpenChange }: { onFormOpenChange?: (open: boolean) => void } = {}) {
  const [activeForm, setActiveForm] = useState<EnquiryForm | null>(null)
  const setOpenForm = (form: EnquiryForm | null) => {
    setActiveForm(form)
    onFormOpenChange?.(form !== null)
  }
  const [selected, setSelected] = useState<string[]>([])
  const nextPath = `/contact?${new URLSearchParams({ enquiryType: 'Custom 3D Modeling', services: selected.join(', ') })}`

  const selectedForm = selected.map((title) => ENQUIRY_FORMS[title]).find(Boolean)

  if (activeForm === 'lifestyle') return <LifestyleEnquiryForm onBack={() => setOpenForm(null)} />
  if (activeForm === 'product') return <ProductImagesEnquiryForm onBack={() => setOpenForm(null)} />
  if (activeForm === 'modeling') return <ModelingEnquiryForm onBack={() => setOpenForm(null)} />
  if (activeForm === 'packaging') return <PackagingEnquiryForm onBack={() => setOpenForm(null)} />
  if (activeForm === 'animation') return <AnimationEnquiryForm onBack={() => setOpenForm(null)} />

  return (
    <section className="project-services" aria-label="Select services for your custom project">
      <ol className="project-services__steps" aria-label="Project enquiry steps">
        {['Select Services', 'Product Details', 'Review & Submit'].map((step, index) => (
          <li key={step} aria-current={index === 0 ? 'step' : undefined}>
            <span>{index + 1}</span>{step}
          </li>
        ))}
      </ol>
      <p className="project-services__intro">Choose the services you need. Select a card to add it to your enquiry, then continue with Next Step.</p>
      <div className="project-services__grid">
        {SERVICES.map((service) => (
          <label key={service.title} className={`project-services__card${selected.includes(service.title) ? ' project-services__card--selected' : ''}`}>
            <input type="checkbox" checked={selected.includes(service.title)} onChange={() => { setSelected((current) => current.includes(service.title) ? current.filter((title) => title !== service.title) : [...current, service.title]); const form = ENQUIRY_FORMS[service.title]; if (form && !selected.includes(service.title)) setOpenForm(form) }} />
            <span className="project-services__visual"><ServiceVisual service={service} /></span>
            <span className="project-services__title">{service.title}</span>
            <span className="project-services__description">{service.description}</span>
            <span className="project-services__footer">
              <span className="project-services__cta">{selected.includes(service.title) ? 'Selected for enquiry' : 'Select to enquire'}</span>
              <span className="project-services__arrow" aria-hidden="true">{selected.includes(service.title) ? '✓' : '→'}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="project-services__help">
        <span className="project-services__headphones" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 13v-2a7 7 0 0 1 14 0v2M5 12H4v7h4v-7zM19 12h1v7h-4v-7z" /></svg></span>
        <div className="project-services__help-copy"><strong>Not sure which service fits your needs?</strong><p>Talk to our experts and we’ll help you choose the right solution for your project.</p></div>
        <div className="project-services__actions">
          <Link className="project-services__expert" to="/contact"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 13v-2a7 7 0 0 1 14 0v2M5 12H4v7h4v-7zM19 12h1v7h-4v-7z" /></svg> Talk to an Expert</Link>
          {selectedForm ? <button type="button" className="project-services__next" onClick={() => setOpenForm(selectedForm)}>Next Step <span aria-hidden="true">?</span></button> : selected.length ? <Link className="project-services__next" to={nextPath}>Next Step <span aria-hidden="true">→</span></Link> : <button className="project-services__next" disabled>Next Step <span aria-hidden="true">→</span></button>}
        </div>
      </div>
      {!selected.length && <p className="project-services__hint" role="status">Select at least one service to continue.</p>}
    </section>
  )
}
