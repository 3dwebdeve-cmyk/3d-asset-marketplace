import { Link } from 'react-router-dom'

import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import '../../styles/marketing.css'
import {
  COOKIE_POLICY_PATH,
  REFUND_POLICY_PATH,
  COOKIE_POLICY_VERSION,
  LEGAL_DOCUMENT_VERSIONS,
  PRIVACY_PATH,
  TERMS_PATH,
} from '../../lib/legalDocuments'

type LegalKind = 'terms' | 'privacy' | 'cookies'

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
  cookies: {
    title: 'Cookie Policy | AssetHive3D',
    description:
      'Which cookies and browser storage AssetHive3D uses, why, and how to control them.',
    heading: 'Cookie Policy',
    version: COOKIE_POLICY_VERSION,
    otherLabel: 'Privacy Policy',
    otherPath: PRIVACY_PATH,
  },
}

interface LegalDocumentPageProps {
  kind: LegalKind
}

function LegalDocumentPage({ kind }: LegalDocumentPageProps) {
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
            Document version{' '}
            <strong>{kind === 'cookies' ? COOKIE_POLICY_VERSION : LEGAL_DOCUMENT_VERSIONS[kind]}</strong>.{' '}
            {kind === 'cookies'
              ? 'This policy explains the cookies and browser storage the site uses.'
              : 'By creating an account or completing checkout, you confirm you have read this document.'}
          </p>
          <p className="home-page__subtitle">
            Also see our{' '}
            <Link className="auth-link" to={copy.otherPath}>
              {copy.otherLabel}
            </Link>
            .
          </p>
        </header>

        {kind === 'terms' ? <TermsBody /> : kind === 'privacy' ? <PrivacyBody /> : <CookiesBody />}

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
          Refunds follow our{' '}
          <Link className="auth-link" to={REFUND_POLICY_PATH}>
            Refund Policy
          </Link>
          . In short: digital files are available as soon as you pay, so we do not refund a change
          of mind, but we do refund within 14 days when an item is faulty, materially not as
          described, bought twice by mistake, or could not be delivered. A full refund ends your
          download access and your license to the item.
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
        <h2>7. Cookies</h2>
        <p>
          We use only the cookies and browser storage needed to sign you in, keep the site secure,
          and save form drafts on your device. We do not use advertising or tracking cookies. See
          our{' '}
          <Link className="auth-link" to={COOKIE_POLICY_PATH}>
            Cookie Policy
          </Link>{' '}
          for the full list.
        </p>
      </section>
      <section>
        <h2>8. Changes</h2>
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

function CookiesBody() {
  return (
    <article className="legal-document-page__body">
      <section>
        <h2>1. What cookies are</h2>
        <p>
          Cookies are small text files a website stores in your browser. Browser storage
          (localStorage) is similar, but it stays on your device and is not sent to our servers.
        </p>
      </section>
      <section>
        <h2>2. Cookies we use</h2>
        <p>
          AssetHive3D uses only strictly necessary cookies. The site cannot work without them, so
          they do not need your consent and there is no option to switch them off.
        </p>
        <div className="legal-document-page__table-wrap">
          <table className="legal-document-page__table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Purpose</th>
                <th scope="col">How long it lasts</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>refresh_token</code>
                </td>
                <td>Keeps you signed in. Page scripts cannot read it (httpOnly).</td>
                <td>30 days with “remember me”, otherwise until you close the browser</td>
              </tr>
              <tr>
                <td>
                  <code>refresh_remember</code>
                </td>
                <td>Remembers that you chose “remember me” when signing in.</td>
                <td>30 days</td>
              </tr>
              <tr>
                <td>
                  <code>csrftoken</code>
                </td>
                <td>Protects staff back-office forms against cross-site request forgery.</td>
                <td>1 year</td>
              </tr>
              <tr>
                <td>
                  <code>sessionid</code>
                </td>
                <td>Keeps staff signed in to the back office.</td>
                <td>2 weeks, or until sign-out</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>3. Browser storage</h2>
        <p>
          When you save a draft of a custom project enquiry, the form contents are kept in your
          browser&apos;s localStorage so you can continue later. Selected files are not stored.
          Clearing your browser data removes these drafts.
        </p>
      </section>
      <section>
        <h2>4. No tracking or advertising cookies</h2>
        <p>
          We do not use analytics, advertising, or social media tracking cookies. If we add any, we
          will update this policy and ask for your consent before setting them.
        </p>
      </section>
      <section>
        <h2>5. Payments</h2>
        <p>
          Checkout takes place on Stripe&apos;s secure payment page. Stripe may set its own cookies
          there, for example to prevent fraud. These are covered by{' '}
          <a
            className="auth-link"
            href="https://stripe.com/legal/cookies-policy"
            target="_blank"
            rel="noreferrer"
          >
            Stripe&apos;s cookie policy
          </a>
          .
        </p>
      </section>
      <section>
        <h2>6. Controlling cookies</h2>
        <p>
          You can view, block, or delete cookies in your browser settings. If you block the cookies
          listed above, you will not be able to sign in, check out, or download your purchases.
        </p>
      </section>
      <section>
        <h2>7. Changes</h2>
        <p>When this policy changes, the document version at the top of this page is updated.</p>
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

export function CookiePolicyPage() {
  return <LegalDocumentPage kind="cookies" />
}
