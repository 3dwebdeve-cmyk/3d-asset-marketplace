import { CUSTOM_PROJECTS_SEO } from '../../lib/seoPages'
import { buildCustomProjectsJsonLd } from '../../lib/customProjectSeo'
import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { BriefServiceSelector } from './BriefServiceSelector'

export function CustomProjectsLandingPage() {
  useDocumentSeo({ ...CUSTOM_PROJECTS_SEO, canonicalPath: '/custom-projects', structuredData: buildCustomProjectsJsonLd() })
  return <main className="custom-studio">
    <div>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-content">
          <h1 id="hero-title">
            <span style={{ whiteSpace: 'nowrap' }}>Can&rsquo;t find the model?</span>
            <br />
            <span className="highlight">We&rsquo;ll make it.</span>
          </h1>
        </div>
      </section>
    </div>
    <section className="hive-enquiry" id="brief-the-hive" aria-labelledby="hive-enquiry-heading">
      <div className="hive-enquiry-layout">
        <div className="hive-enquiry-copy">
          <h2 id="hive-enquiry-heading">Brief the Hive.<br />Get a price and timeline in 16 hours.</h2>
          <p>Product models, ad-ready renders, animation, packaging, AR. Tell us what you’re making and a real producer will reply with cost, turnaround and answers. No call needed, and nothing to pay until you approve the quote.</p>
          <ol className="hive-enquiry-timeline">
            <li><strong>Send your enquiry</strong><p>Takes about three minutes.</p></li>
            <li><strong>Get your quote in 10–16 hours</strong><p>Price, turnaround time and answers to your questions.</p></li>
            <li><strong>Confirm with a 30% payment</strong><p>Work starts as soon as the payment is confirmed.</p></li>
            <li><strong>Review and receive files</strong><p>Delivered in the formats you chose.</p></li>
          </ol>
          <p className="hive-enquiry-note"><strong>No payment is needed to enquire.</strong> You only pay 30% once you’ve accepted the quote.</p>
        </div>
        <BriefServiceSelector compact />
      </div>
    </section>
    <div>
      <div className="studio-information">
        <section className="studio-info studio-capabilities" aria-labelledby="studio-capabilities-heading">
          <header className="studio-capabilities-header">
            <h2 id="studio-capabilities-heading">Whatever the product needs to<br className="desktop-break" /> look like, we build it.</h2>
          </header>
          <div className="studio-info-grid">
            <article className="studio-capability">
              <h3>Renders that sell</h3>
              <p>White-background, lifestyle and hero images sized for Amazon, Walmart, Shopify and your own catalogue.</p>
            </article>
            <article className="studio-capability">
              <h3>Models built to spec</h3>
              <p>Clean, production-ready 3D from CAD files, sketches or plain photographs.</p>
            </article>
            <article className="studio-capability">
              <h3>Furniture and room sets</h3>
              <p>Styled interiors, fabric and finish variants, and full catalogues from one set of models.</p>
            </article>
            <article className="studio-capability">
              <h3>Packaging and shelf visuals</h3>
              <p>Pack mockups, dielines and in-store scenes, so you can judge a design before printing it.</p>
            </article>
            <article className="studio-capability">
              <h3>Animation and ad films</h3>
              <p>Product spins, feature walk-throughs and short social ads, delivered ready to post.</p>
            </article>
            <article className="studio-capability">
              <h3>AR and Web3D assets</h3>
              <p>Lightweight GLB and USDZ files that load fast in viewers, configurators and try-on.</p>
            </article>
          </div>
        </section>
        <div className="studio-benefits-row">
          <section className="studio-info studio-benefits" aria-labelledby="studio-benefits-heading">
            <p className="studio-panel-label">Designed around your workflow</p>
            <h2 id="studio-benefits-heading">Built for teams that don&rsquo;t have time to chase quotes.</h2>
            <div className="studio-info-grid">
              <article>
                <h3>One brief, one reply</h3>
                <p>A producer reads your enquiry and answers in 10&ndash;16 hours with price, turnaround and any questions in one message.</p>
              </article>
              <article>
                <h3>Price fixed before you pay</h3>
                <p>You see the full cost and delivery date first. Work starts after a 30% payment, so there are no surprises.</p>
              </article>
              <article>
                <h3>Made for volume</h3>
                <p>Our team has 15+ years of production experience, so 5 images or 500 SKUs run through the same process.</p>
              </article>
            </div>
          </section>
          <section className="studio-faq studio-faq--side" aria-labelledby="faq-heading">
            <div className="studio-faq-inner">
              <p className="studio-panel-label">Need to know</p>
              <h2 id="faq-heading">Before you send your brief.</h2>
              <p className="studio-faq-intro">A few answers to help you get started.</p>
              <div className="faq-list">
                <details>
                  <summary>What happens after I submit?</summary>
                  <p>A producer will review your enquiry and reply by email with a price, turnaround time and any questions.</p>
                </details>
                <details>
                  <summary>Do I pay anything to enquire?</summary>
                  <p>No payment is needed to enquire. Work starts once you have approved the quote and the 30% payment is confirmed.</p>
                </details>
                <details>
                  <summary>I only have photos or a rough idea. Is that enough?</summary>
                  <p>Yes. Share your photos, sketches or a description of your idea, along with what you need to create. We can clarify the details when scoping the project.</p>
                </details>
                <details>
                  <summary>I don&rsquo;t know my budget. Can I still enquire?</summary>
                  <p>Yes. Choose &ldquo;Not sure yet&rdquo; in the budget field and describe what you need so the team can scope the work.</p>
                </details>
                <details>
                  <summary>Can you sign an NDA?</summary>
                  <p>Select the NDA option in the contact step to request an agreement before sharing confidential files.</p>
                </details>
              </div>
              <a className="studio-faq-contact" href="#brief-the-hive">Have a question about your project?</a>
            </div>
          </section>
        </div>
      </div>
      <section className="brief-cta brief-cta--banner" aria-labelledby="closing-brief-heading">
        <div className="brief-cta-inner">
          <div>
            <p className="brief-cta-eyebrow">Have a brief?</p>
            <h2 id="closing-brief-heading">Send Us Your Requirements</h2>
            <p className="brief-cta-description">The sooner it reaches us, the sooner you have a price and a date to plan around.</p>
          </div>
          <div className="brief-cta-actions">
            <a className="brief-cta-button brief-cta-primary" href="#brief-the-hive">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13" /></svg>
              Brief the Hive
            </a>
            <a className="brief-cta-button" href="/contact">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m3 7 9 7 9-7" /></svg>
              Contact
            </a>
          </div>
        </div>
      </section>
    </div>
  </main>
}
