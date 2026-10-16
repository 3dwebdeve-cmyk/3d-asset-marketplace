import { Link } from 'react-router-dom'

import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import '../../styles/marketing.css'
import { LEGAL_DOCUMENT_VERSIONS, PRIVACY_PATH, TERMS_PATH } from '../../lib/legalDocuments'

type LegalKind = 'terms' | 'privacy'

const COPY: Record<
  LegalKind,
  { title: string; description: string; heading: string; version: string; otherLabel: string; otherPath: string }
> = {
  terms: {
    title: 'Terms of Service | AssetHive3D',
    description:
      'Terms of Service for buying 3D models, plugins, and custom project work on AssetHive3D.',
    heading: 'Terms of Service',
    version: LEGAL_DOCUMENT_VERSIONS.terms,
    otherLabel: 'Privacy Policy',
    otherPath: PRIVACY_PATH,
  },
  privacy: {
    title: 'Privacy Policy | AssetHive3D',
    description:
      'How AssetHive3D collects, uses, and protects account and order information.',
    heading: 'Privacy Policy',
    version: LEGAL_DOCUMENT_VERSIONS.privacy,
    otherLabel: 'Terms of Service',
    otherPath: TERMS_PATH,
  },
}

interface LegalDocumentPageProps {
  kind: LegalKind
}

export function LegalDocumentPage({ kind }: LegalDocumentPageProps) {
  const copy = COPY[kind]

  useDocumentSeo({
    title: copy.title,
    description: copy.description,
  })

  return (
    <main className="marketing-page legal-document-page">
      <div className="marketing-page__inner">
        <header className="marketing-page__intro">
          <p className="marketing-page__eyebrow">Legal</p>
          <h1>{copy.heading}</h1>
          <p className="home-page__subtitle">
            Document version <strong>{LEGAL_DOCUMENT_VERSIONS[kind]}</strong>. By creating an account or completing
            checkout, you confirm you have read this document.
          </p>
          <p className="home-page__subtitle">
            Also see our{' '}
            <Link className="auth-link" to={copy.otherPath}>
              {copy.otherLabel}
            </Link>
            .
          </p>
        </header>

        {kind === 'terms' ? <TermsBody /> : <PrivacyBody />}

        <p className="home-page__subtitle">
          Questions?{' '}
          <Link className="auth-link" to="/contact">
            Contact us
          </Link>
          .
        </p>
      </div>
    </main>
  )
}

function TermsBody() {
  return (
    <article className="legal-document-page__body">
      <section>
        <h2>1. The marketplace</h2>
        <p>
          These Terms govern your use of the 3D Asset Marketplace website, including purchases of
          digital 3D models and plugins, and requests for custom 3D design work.
        </p>
      </section>
      <section>
        <h2>2. Accounts</h2>
        <p>
          You must provide accurate registration details, keep your credentials secure, and use the
          service only for lawful purposes. Email verification may be required before checkout or
          custom project actions.
        </p>
      </section>
      <section>
        <h2>3. Digital products and licenses</h2>
        <p>
          Product pages describe license terms, formats, and deliverables. After a successful paid
          order, you receive access to entitled downloads under the license shown at purchase. You
          may not redistribute paid packages beyond that license.
        </p>
      </section>
      <section>
        <h2>4. Payments</h2>
        <p>
          Payments are processed by Stripe. Orders are fulfilled after payment confirmation (webhook
          or verified session). Prices are shown before checkout; taxes or currency conversion may
          apply depending on Stripe and your location.
        </p>
      </section>
      <section>
        <h2>5. Custom projects</h2>
        <p>
          Custom project enquiries, quotations, communication, and delivery arrangements are
          handled directly with our team by email. Any agreed scope, pricing, payment terms, and
          delivery terms will be provided in that correspondence.
        </p>
      </section>
      <section>
        <h2>6. Refunds</h2>
        <p>
          Because digital downloads and custom work are intangible, refund eligibility is limited.
          Contact support promptly if a file is defective or fulfillment fails. Stripe refunds, when
          issued, update order and download entitlements according to platform policy.
        </p>
      </section>
      <section>
        <h2>7. Acceptable use</h2>
        <p>
          Do not attempt unauthorized access to other accounts, private storage, admin tools, or
          payment systems. Do not upload malware or unlawful content.
        </p>
      </section>
      <section>
        <h2>8. Changes</h2>
        <p>
          We may update these Terms and bump the document version. Continued use after a version
          change may require re-acceptance at register or checkout.
        </p>
      </section>
      <p className="legal-document-page__draft-note">
        Draft for sandbox / pre-launch review. Have counsel finalize wording before public launch.
      </p>
    </article>
  )
}

function PrivacyBody() {
  return (
    <article className="legal-document-page__body">
      <section>
        <h2>1. Information we collect</h2>
        <p>
          Account details (name, email, optional phone/country), authentication data, order and
          payment metadata (not full card numbers — Stripe handles card data), project messages and
          files you submit, and basic technical logs needed to run and secure the service.
        </p>
      </section>
      <section>
        <h2>2. How we use information</h2>
        <p>
          We use this information to operate the marketplace, fulfill orders and downloads, provide
          custom project collaboration, send transactional email (verification, receipts, project
          alerts), prevent fraud, and improve reliability.
        </p>
      </section>
      <section>
        <h2>3. Processors</h2>
        <p>
          We use service providers such as Stripe (payments), email delivery, cloud object storage
          for assets, and optional error monitoring. They process data only as needed to provide
          those services.
        </p>
      </section>
      <section>
        <h2>4. Retention</h2>
        <p>
          We keep account, order, and entitlement records as long as needed for the service, legal
          obligations, and dispute resolution. You may request account-related changes via contact
          channels.
        </p>
      </section>
      <section>
        <h2>5. Security</h2>
        <p>
          We use industry-standard practices including hashed passwords, scoped API authorization,
          and time-limited signed URLs for private downloads. No method of transmission is 100%
          secure.
        </p>
      </section>
      <section>
        <h2>6. Your choices</h2>
        <p>
          You can update profile information while signed in, and contact us about access or
          deletion requests where applicable law requires.
        </p>
      </section>
      <section>
        <h2>7. Changes</h2>
        <p>
          Privacy Policy updates bump the document version. Material changes may require
          re-acceptance before checkout.
        </p>
      </section>
      <p className="legal-document-page__draft-note">
        Draft for sandbox / pre-launch review. Have counsel finalize wording before public launch.
      </p>
    </article>
  )
}

export function TermsPage() {
  return <LegalDocumentPage kind="terms" />
}

export function PrivacyPage() {
  return <LegalDocumentPage kind="privacy" />
}
