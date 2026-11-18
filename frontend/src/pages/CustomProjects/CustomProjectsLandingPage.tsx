import { CUSTOM_PROJECTS_SEO } from '../../lib/seoPages'
import { buildCustomProjectsJsonLd } from '../../lib/customProjectSeo'
import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import markup from './custom-studio.html?raw'
import './custom-studio.css'
import { BriefServiceSelector } from './BriefServiceSelector'

const [banner, information] = markup.split('<div class="studio-information">')

export function CustomProjectsLandingPage() {
  useDocumentSeo({ ...CUSTOM_PROJECTS_SEO, canonicalPath: '/custom-projects', structuredData: buildCustomProjectsJsonLd() })
  return <main className="custom-studio">
    <div dangerouslySetInnerHTML={{ __html: banner }} />
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
    <div dangerouslySetInnerHTML={{ __html: '<div class="studio-information">' + information }} />
  </main>
}
