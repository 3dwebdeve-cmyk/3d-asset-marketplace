import { Link } from 'react-router-dom'
import { HOME_FAQS, HOME_GUIDE } from '../lib/homeContent'

export function HomeBuyingGuide() {
  return (
    <section className="home-buying-guide" aria-labelledby="home-buying-guide-heading">
      <h2 id="home-buying-guide-heading">Choosing 3D models, plugins and custom services</h2>
      <div className="home-buying-guide__grid">
        {HOME_GUIDE.map((section) => (
          <article key={section.heading}>
            <h3>{section.heading}</h3>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            <ul>
              {section.links.map((link) => <li key={link.path}><Link to={link.path}>{link.label}</Link></li>)}
            </ul>
          </article>
        ))}
      </div>
      <h2>Questions about buying 3D assets</h2>
      {HOME_FAQS.map((faq) => (
        <details key={faq.question}>
          <summary>{faq.question}</summary>
          <p>{faq.answer}</p>
        </details>
      ))}
      <p><Link to="/contact">Contact AssetHive3D about compatibility, licenses or custom work</Link></p>
    </section>
  )
}
