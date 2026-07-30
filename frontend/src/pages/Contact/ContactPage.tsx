import { Link } from 'react-router-dom'

import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { useAuthStore } from '../../store/authStore'
import { useContactForm } from './useContactForm'

export function ContactPage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const {
    register,
    handleSubmit,
    errors,
    isSubmitting,
    serverError,
    successMessage,
    onSubmit,
  } = useContactForm()

  useDocumentSeo({
    title: 'Contact | 3D Asset Marketplace',
    description:
      'Get in touch with our studio about marketplace assets, plugins, or custom 3D design work.',
  })

  return (
    <main className="auth-page">
      <section className="auth-card auth-card--wide" aria-labelledby="contact-title">
        <header className="auth-card__header">
          <p className="auth-card__eyebrow">Get in touch</p>
          <h1 id="contact-title">Contact the studio</h1>
          <p className="auth-card__subtitle">
            Questions about assets, plugins, or a custom project? Send a message and we will
            reply by email. For bespoke work, you can also{' '}
            <Link className="auth-link" to="/custom-projects">
              explore custom projects
            </Link>
            {isAuthenticated ? (
              <>
                {' '}
                or{' '}
                <Link className="auth-link" to="/dashboard/projects/new">
                  submit a project request
                </Link>
              </>
            ) : null}
            .
          </p>
        </header>

        {serverError ? <Alert variant="error" message={serverError} /> : null}
        {successMessage ? <Alert variant="success" message={successMessage} /> : null}

        {!successMessage ? (
          <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
            {/* Honeypot — visually hidden from humans */}
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

            <FormField id="name" label="Your name" error={errors.name?.message}>
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

            <FormField id="email" label="Email address" error={errors.email?.message}>
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

            <FormField id="subject" label="Subject" error={errors.subject?.message}>
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

            <FormField id="message" label="Message" error={errors.message?.message}>
              <textarea
                id="message"
                className={`ui-input${errors.message ? ' ui-input--error' : ''}`}
                rows={6}
                autoComplete="off"
                aria-invalid={Boolean(errors.message)}
                aria-describedby={errors.message ? 'message-error' : undefined}
                {...register('message')}
              />
            </FormField>

            <Button type="submit" isLoading={isSubmitting}>
              Send message
            </Button>
          </form>
        ) : null}

        <p className="auth-card__footer">
          Prefer to browse first?{' '}
          <Link className="auth-link" to="/products">
            Explore the marketplace
          </Link>
        </p>
      </section>
    </main>
  )
}
