import { Link } from 'react-router-dom'

import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import '../../styles/marketing.css'
import { REFUND_POLICY_VERSION, TERMS_PATH } from '../../lib/legalDocuments'

/** The refund window, in days from the purchase date. */
const REFUND_WINDOW_DAYS = 14

export function RefundPolicyPage() {
  useDocumentSeo({
    title: 'Refund Policy | AssetHive3D',
    description:
      'When AssetHive3D refunds 3D model, plugin, and custom project purchases, and how to ask for one.',
  })

  return (
    <main className="marketing-page legal-document-page">
      <div className="marketing-page__inner">
        <header className="marketing-page__intro">
          <p className="marketing-page__eyebrow">Legal</p>
          <h1>Refund Policy</h1>
          <p className="home-page__subtitle">
            Document version <strong>{REFUND_POLICY_VERSION}</strong>. You agree to this policy when
            you tick the immediate-access box at checkout.
          </p>
          <p className="home-page__subtitle">
            Also see our{' '}
            <Link className="auth-link" to={TERMS_PATH}>
              Terms of Service
            </Link>
            .
          </p>
        </header>

        <article className="legal-document-page__body">
          <section>
            <h2>1. In short</h2>
            <p>
              3D models and plugins are digital files you can download straight after paying, so we
              cannot take them back. We do not refund a purchase because you changed your mind. We
              do refund, within {REFUND_WINDOW_DAYS} days of purchase, when something is wrong with
              what you bought or with our service, as described below.
            </p>
          </section>

          <section>
            <h2>2. Your right to cancel and immediate access</h2>
            <p>
              If you live in the EU, the UK, or another country with similar laws, you normally have
              14 days to cancel an online purchase. For digital content, that right ends once the
              content is made available to you, if you agreed to this before paying. At checkout we
              ask you to tick a box confirming that you want immediate access to your files and that
              you understand you lose the right to cancel once they are available. We keep a record
              of that confirmation with your order.
            </p>
          </section>

          <section>
            <h2>3. When we give a refund</h2>
            <p>
              Contact us within {REFUND_WINDOW_DAYS} days of your purchase and we will refund you,
              in full or in part, if:
            </p>
            <ul>
              <li>
                the files are corrupt, incomplete, or will not open in the software and version the
                listing names;
              </li>
              <li>
                the item is materially different from its listing, for example a missing file
                format, missing textures, or a lower polygon count than stated;
              </li>
              <li>you were charged twice, or bought the same package or plugin twice by mistake;</li>
              <li>
                you paid but could not download your files because of a fault on our side that we
                could not fix.
              </li>
            </ul>
            <p>
              Where we can, we will first try to fix the problem, for example by sending a corrected
              file. If we cannot fix it within a reasonable time, we will refund you.
            </p>
          </section>

          <section>
            <h2>4. When we do not give a refund</h2>
            <ul>
              <li>you changed your mind, or no longer need the item;</li>
              <li>
                you bought the wrong item or package when the listing clearly described what it
                contains;
              </li>
              <li>
                you do not have the software, plugins, or skills needed to use the files, when the
                listing states those requirements;
              </li>
              <li>more than {REFUND_WINDOW_DAYS} days have passed since your purchase;</li>
              <li>the item was free.</li>
            </ul>
          </section>

          <section>
            <h2>5. How to ask for a refund</h2>
            <p>
              Use our{' '}
              <Link className="auth-link" to="/contact">
                contact page
              </Link>{' '}
              and include your order number (shown in your dashboard and on your receipt), the item
              and package, what is wrong, and screenshots or error messages if you have them. We aim
              to reply within 3 business days.
            </p>
          </section>

          <section>
            <h2>6. How refunds are paid</h2>
            <p>
              Approved refunds go back to the card or payment method you used, through our payment
              provider, Stripe. Most banks show the refund within 5 to 10 business days. We do not
              give refunds as cash or store credit unless you ask for that.
            </p>
            <p>
              A full refund ends your download access and your license to the item. A partial
              refund, for example for one faulty package out of several, leaves the rest of your
              purchase in place.
            </p>
          </section>

          <section>
            <h2>7. After a full refund</h2>
            <p>
              Your license to use the item ends. Please delete any copies of the files you
              downloaded and do not use them in new or existing projects.
            </p>
          </section>

          <section>
            <h2>8. Custom projects</h2>
            <p>
              Custom work is agreed by quotation, and the quotation&apos;s payment and delivery terms
              apply. Unless your quotation says otherwise: before work starts, you can cancel for a
              full refund; once work has started, payment for work already done is not refundable;
              and stages you have received and approved are not refundable. If we cannot deliver
              what we agreed, we refund the part we did not deliver.
            </p>
          </section>

          <section>
            <h2>9. Chargebacks</h2>
            <p>
              Please contact us before disputing a payment with your bank. Most problems can be
              fixed faster that way. If a payment is disputed, we share the order record, your
              checkout confirmation, and the download history with the payment provider.
            </p>
          </section>

          <section>
            <h2>10. Your legal rights</h2>
            <p>
              This policy does not limit any rights you have under the consumer laws of the country
              you live in.
            </p>
          </section>

          <section>
            <h2>11. Changes</h2>
            <p>
              When this policy changes, the document version at the top of this page is updated.
              The version in force when you bought an item applies to that purchase.
            </p>
          </section>

          <p className="legal-document-page__draft-note">
            Draft for sandbox / pre-launch review. Have counsel finalize wording before public
            launch.
          </p>
        </article>

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
