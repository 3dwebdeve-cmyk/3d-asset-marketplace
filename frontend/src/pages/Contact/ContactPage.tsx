import { useId, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { Link } from 'react-router-dom'

import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import {
  CONTACT_HERO_IMAGE_SRC,
  SiteHeroImage,
} from '../../components/SiteHeroImage'
import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { ENQUIRY_TYPES } from './contactSchema'
import { PhoneCountrySelect } from './PhoneCountrySelect'
import { useContactForm } from './useContactForm'

const ENQUIRY_TOPICS = [
  {
    title: '3D Model Information',
    description: 'Questions about our models, formats, licenses, or compatibility.',
    icon: 'shield',
  },
  {
    title: 'Plugins & Tools',
    description: 'Product details, features, technical requirements or support.',
    icon: 'plugin',
  },
  {
    title: 'Custom 3D Modeling',
    description: 'Need something special? Share your requirements for a custom quote.',
    icon: 'custom',
  },
  {
    title: 'Bulk Purchase / Studio Licensing',
    description: 'Get special pricing for teams, studios or large projects.',
    icon: 'bulk',
  },
  {
    title: 'Technical Support',
    description: 'Help with downloads, installation, or technical issues.',
    icon: 'support',
  },
] as const

const FAQ_ITEMS = [
  {
    question: 'How soon will I get a response?',
    answer:
      'We usually reply within 24 hours on business days. Urgent production questions are prioritized whenever we can.',
  },
  {
    question: 'Can you create a custom 3D model for my project?',
    answer:
      'Yes. Share your brief here or start a custom project request so we can quote scope, formats, and delivery timelines.',
  },
  {
    question: 'Do you offer bulk or studio licensing?',
    answer:
      'We do. Tell us how many seats or assets you need and we will outline licensing options for your studio or team.',
  },
  {
    question: 'Which file formats do you support?',
    answer:
      'Most catalog models ship with common DCC formats such as FBX, OBJ, and GLB, plus textures where available. Ask us if you need a specific pipeline.',
  },
  {
    question: 'Can I attach reference images to my enquiry?',
    answer:
      'You can select reference files on this form so our team knows what you prepared. For full project file exchange, use the custom project portal after we reply.',
  },
] as const

function TopicIcon({ name }: { name: (typeof ENQUIRY_TOPICS)[number]['icon'] }) {
  switch (name) {
    case 'shield':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3 5 6.5v5.2c0 4.2 2.8 7.9 7 8.8 4.2-.9 7-4.6 7-8.8V6.5L12 3Z" />
          <path d="m9.2 12.1 1.9 1.9 3.7-3.8" />
        </svg>
      )
    case 'plugin':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6" />
        </svg>
      )
    case 'custom':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 19V5l14 14H5Z" />
          <path d="M9 19h10" />
          <path d="M8 10.5h3.5M8 14h5.5" />
        </svg>
      )
    case 'bulk':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="9" cy="8" r="3" />
          <circle cx="16.5" cy="9" r="2.5" />
          <path d="M3.5 19c.7-3 2.9-4.5 5.5-4.5S14 16 14.7 19" />
          <path d="M14 14.7c1.4-.7 3-.8 4.8.1 1.5.8 2.4 2.2 2.7 4.2" />
        </svg>
      )
    case 'support':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.5 12a7.5 7.5 0 0 1 15 0" />
          <path d="M5.5 12v3.5a2 2 0 0 0 2 2H9v-7H7.5A2 2 0 0 0 5.5 12Z" />
          <path d="M18.5 12v3.5a2 2 0 0 1-2 2H15v-7h1.5a2 2 0 0 1 2 2Z" />
          <path d="M12 19.5v1M10 21.5h4" />
        </svg>
      )
    default:
      return null
  }
}

export function ContactPage() {
  const fileInputId = useId()
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0)
  const [isDragging, setIsDragging] = useState(false)
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    errors,
    isSubmitting,
    serverError,
    successMessage,
    attachmentError,
    attachments,
    onAttachmentsChange,
    clearAttachments,
    onSubmit,
  } = useContactForm()

  const selectedPhoneCountryIso = watch('phoneCountryCode')

  useDocumentSeo({
    title: 'Enquiry | 3D Asset Marketplace',
    description:
      'Enquire about 3D models, plugins, custom work, bulk licensing, or technical support. We usually respond within 24 hours.',
  })

  const onFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    onAttachmentsChange(event.target.files)
    event.target.value = ''
  }

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setIsDragging(false)
    onAttachmentsChange(event.dataTransfer.files)
  }

  return (
    <main className="marketing-page enquiry-page">
      <header className="enquiry-hero site-hero-banner" aria-labelledby="enquiry-title">
        <SiteHeroImage src={CONTACT_HERO_IMAGE_SRC} width={4216} height={992} />
        <div className="enquiry-hero__content">
          <h1 id="enquiry-title">
            Enquire About 3D Models, Plugins or <span>Custom Work</span>.
          </h1>
          <p className="enquiry-hero__lead">
            Ask a question, request a custom model, discuss bulk pricing, or get technical
            support from our 3D specialists.
          </p>
        </div>
      </header>

      <div className="enquiry-page__inner">
        <div className="enquiry-layout">
          <section className="enquiry-form-card" aria-labelledby="enquiry-form-title">
            <header className="enquiry-form-card__header">
              <h2 id="enquiry-form-title">Send Us an Enquiry</h2>
              <p>
                Fill in the details below and our team will get back to you as soon as
                possible.
              </p>
            </header>

            {serverError ? <Alert variant="error" message={serverError} /> : null}
            {successMessage ? <Alert variant="success" message={successMessage} /> : null}

            {!successMessage ? (
              <form
                className="enquiry-form"
                onSubmit={handleSubmit(onSubmit)}
                noValidate
              >
                <div className="contact-honeypot" aria-hidden="true">
                  <label htmlFor="website">Website</label>
                  <input
                    id="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    {...register('website')}
                  />
                </div>

                <div className="enquiry-form__row">
                  <FormField id="name" label="Your Name *" error={errors.name?.message}>
                    <Input
                      id="name"
                      type="text"
                      autoComplete="name"
                      hasError={Boolean(errors.name)}
                      aria-invalid={Boolean(errors.name)}
                      aria-describedby={errors.name ? 'name-error' : undefined}
                      {...register('name')}
                    />
                  </FormField>

                  <FormField
                    id="company"
                    label="Company / Studio (Optional)"
                    error={errors.company?.message}
                  >
                    <Input
                      id="company"
                      type="text"
                      autoComplete="organization"
                      hasError={Boolean(errors.company)}
                      aria-invalid={Boolean(errors.company)}
                      aria-describedby={errors.company ? 'company-error' : undefined}
                      {...register('company')}
                    />
                  </FormField>
                </div>

                <div className="enquiry-form__row">
                  <FormField
                    id="email"
                    label="Email Address *"
                    error={errors.email?.message}
                  >
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      hasError={Boolean(errors.email)}
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={errors.email ? 'email-error' : undefined}
                      {...register('email')}
                    />
                  </FormField>

                  <FormField
                    id="phone"
                    label={
                      <>
                        Phone <span className="form-field__optional">(Optional)</span>
                      </>
                    }
                    error={errors.phone?.message}
                  >
                    <div
                      className={`enquiry-phone${errors.phone ? ' enquiry-phone--error' : ''}`}
                    >
                      <input type="hidden" {...register('phoneCountryCode')} />
                      <PhoneCountrySelect
                        id="phoneCountryCode"
                        value={selectedPhoneCountryIso}
                        onChange={(iso) =>
                          setValue('phoneCountryCode', iso, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                      />
                      <span className="enquiry-phone__divider" aria-hidden="true" />
                      <Input
                        id="phone"
                        type="tel"
                        className="enquiry-phone__input"
                        autoComplete="tel-national"
                        placeholder="Enter phone number"
                        hasError={Boolean(errors.phone)}
                        aria-invalid={Boolean(errors.phone)}
                        aria-describedby={errors.phone ? 'phone-error' : undefined}
                        {...register('phone')}
                      />
                    </div>
                  </FormField>
                </div>

                <FormField
                  id="enquiryType"
                  label="Enquiry Type *"
                  error={errors.enquiryType?.message}
                >
                  <select
                    id="enquiryType"
                    className={`ui-input enquiry-select${errors.enquiryType ? ' ui-input--error' : ''}`}
                    aria-invalid={Boolean(errors.enquiryType)}
                    aria-describedby={errors.enquiryType ? 'enquiryType-error' : undefined}
                    {...register('enquiryType')}
                  >
                    <option value="" disabled>
                      Choose an enquiry type
                    </option>
                    {ENQUIRY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField id="subject" label="Subject *" error={errors.subject?.message}>
                  <Input
                    id="subject"
                    type="text"
                    autoComplete="off"
                    hasError={Boolean(errors.subject)}
                    aria-invalid={Boolean(errors.subject)}
                    aria-describedby={errors.subject ? 'subject-error' : undefined}
                    {...register('subject')}
                  />
                </FormField>

                <FormField
                  id="message"
                  label="Your Message *"
                  error={errors.message?.message}
                >
                  <textarea
                    id="message"
                    className={`ui-input enquiry-textarea${errors.message ? ' ui-input--error' : ''}`}
                    rows={7}
                    autoComplete="off"
                    aria-invalid={Boolean(errors.message)}
                    aria-describedby={errors.message ? 'message-error' : undefined}
                    {...register('message')}
                  />
                </FormField>

                <div className="enquiry-attach">
                  <p className="enquiry-attach__label" id="enquiry-attach-label">
                    Attach Files <span>(Optional)</span>
                  </p>
                  <label
                    htmlFor={fileInputId}
                    className={`enquiry-attach__dropzone${isDragging ? ' enquiry-attach__dropzone--active' : ''}`}
                    onDragEnter={(event) => {
                      event.preventDefault()
                      setIsDragging(true)
                    }}
                    onDragOver={(event) => {
                      event.preventDefault()
                      setIsDragging(true)
                    }}
                    onDragLeave={(event) => {
                      event.preventDefault()
                      setIsDragging(false)
                    }}
                    onDrop={onDrop}
                  >
                    <span className="enquiry-attach__icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M12 15V5" />
                        <path d="m8.5 8.5 3.5-3.5 3.5 3.5" />
                        <path d="M5 16.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5" />
                      </svg>
                    </span>
                    <span className="enquiry-attach__title">
                      Drag &amp; drop files here or <em>click to browse</em>
                    </span>
                    <span className="enquiry-attach__hint">
                      Supports images, reference files, sketches (Max 20MB)
                    </span>
                    <input
                      id={fileInputId}
                      className="enquiry-attach__input"
                      type="file"
                      multiple
                      accept="image/*,.pdf,.zip,.rar,.7z,.txt,.doc,.docx"
                      aria-labelledby="enquiry-attach-label"
                      onChange={onFileInputChange}
                    />
                  </label>
                  {attachments.length > 0 ? (
                    <div className="enquiry-attach__files">
                      <ul>
                        {attachments.map((file) => (
                          <li key={`${file.name}-${file.size}`}>{file.name}</li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        className="enquiry-attach__clear"
                        onClick={clearAttachments}
                      >
                        Clear files
                      </button>
                    </div>
                  ) : null}
                  {attachmentError ? (
                    <p className="form-field__error" role="alert">
                      {attachmentError}
                    </p>
                  ) : null}
                </div>

                <div className="enquiry-tip" role="note">
                  <span className="enquiry-tip__icon" aria-hidden="true">
                    i
                  </span>
                  <p>
                    You can share reference images, sketches or sample files to help us
                    understand your requirement better.
                  </p>
                </div>

                <div className="enquiry-consent">
                  <label className="enquiry-consent__label">
                    <input type="checkbox" {...register('privacyAccepted')} />
                    <span>
                      I agree to the{' '}
                      <Link to="/contact">Privacy Policy</Link> and allow the team to contact
                      me regarding this enquiry.
                    </span>
                  </label>
                  {errors.privacyAccepted ? (
                    <p className="form-field__error" role="alert">
                      {errors.privacyAccepted.message}
                    </p>
                  ) : null}
                </div>

                <div className="enquiry-form__actions">
                  <Button type="submit" isLoading={isSubmitting} className="enquiry-submit">
                    <span className="enquiry-submit__icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M4 11.5 20 4l-5.5 16-3-6.5L4 11.5Z" />
                      </svg>
                    </span>
                    Send Message
                  </Button>
                  <p className="enquiry-form__response-note">
                    We usually respond within 24 hours.
                  </p>
                </div>
              </form>
            ) : (
              <p className="enquiry-form-card__success-followup">
                Prefer to browse while you wait?{' '}
                <Link to="/3d-models">Explore 3D models</Link> or{' '}
                <Link to="/custom-projects">review custom projects</Link>.
              </p>
            )}
          </section>

          <aside className="enquiry-sidebar" aria-label="Enquiry help">
            <section className="enquiry-topics" aria-labelledby="enquiry-topics-title">
              <header className="enquiry-topics__header">
                <div className="enquiry-topics__heading">
                  <span className="enquiry-topics__badge" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M5 5h14v9.5H9.2L5 18V5Z" />
                      <path d="M9 9.5h6M9 12.5h4" />
                    </svg>
                  </span>
                  <div>
                    <h2 id="enquiry-topics-title">What can you enquire about?</h2>
                    <p className="enquiry-topics__subtitle">
                      We&apos;re happy to help with anything related to our 3D assets and tools.
                    </p>
                  </div>
                </div>
              </header>
              <ul className="enquiry-topics__list">
                {ENQUIRY_TOPICS.map((topic) => (
                  <li key={topic.title}>
                    <span
                      className={`enquiry-topics__icon enquiry-topics__icon--${topic.icon}`}
                      aria-hidden="true"
                    >
                      <TopicIcon name={topic.icon} />
                    </span>
                    <div className="enquiry-topics__copy">
                      <strong>{topic.title}</strong>
                      <p>{topic.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="enquiry-faq" aria-labelledby="enquiry-faq-title">
              <div className="enquiry-faq__header">
                <h2 id="enquiry-faq-title">Frequently Asked Questions</h2>
                <Link className="enquiry-faq__view-all" to="/about">
                  View All
                </Link>
              </div>
              <div className="enquiry-faq__list">
                {FAQ_ITEMS.map((item, index) => {
                  const isOpen = openFaqIndex === index
                  const panelId = `enquiry-faq-panel-${index}`
                  const buttonId = `enquiry-faq-button-${index}`
                  return (
                    <div
                      key={item.question}
                      className={`enquiry-faq__item${isOpen ? ' enquiry-faq__item--open' : ''}`}
                    >
                      <h3>
                        <button
                          id={buttonId}
                          type="button"
                          className="enquiry-faq__question"
                          aria-expanded={isOpen}
                          aria-controls={panelId}
                          onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                        >
                          <span>{item.question}</span>
                          <span className="enquiry-faq__chevron" aria-hidden="true">
                            {isOpen ? '▾' : '▸'}
                          </span>
                        </button>
                      </h3>
                      {isOpen ? (
                        <div
                          id={panelId}
                          role="region"
                          aria-labelledby={buttonId}
                          className="enquiry-faq__answer"
                        >
                          <p>{item.answer}</p>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </section>

            <div className="enquiry-contact-cards">
              <div className="enquiry-contact-card">
                <span className="enquiry-contact-card__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M4 6h16v12H4z" />
                    <path d="m4 7 8 6 8-6" />
                  </svg>
                </span>
                <div>
                  <p className="enquiry-contact-card__label">Email</p>
                  <a href="mailto:support@3dhub.com">support@3dhub.com</a>
                </div>
              </div>
              <div className="enquiry-contact-card">
                <span className="enquiry-contact-card__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="8" />
                    <path d="M12 8v5l3 2" />
                  </svg>
                </span>
                <div>
                  <p className="enquiry-contact-card__label">Working Hours</p>
                  <p>Mon - Fri: 9:30 AM - 6:30 PM (IST)</p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
