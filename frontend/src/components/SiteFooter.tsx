import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export function SiteFooter() {
  const year = new Date().getFullYear()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')

  const onSubscribe = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = email.trim()
    navigate(trimmed ? `/contact?email=${encodeURIComponent(trimmed)}` : '/contact')
  }

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand-col">
          <Link className="site-footer__brand" to="/">
            3D HUB
          </Link>
          <p className="site-footer__blurb">
            The world&apos;s premium 3D model marketplace for creators, game developers,
            animators, and VFX studios worldwide.
          </p>
          <form className="site-footer__subscribe" onSubmit={onSubscribe}>
            <label className="visually-hidden" htmlFor="footer-subscribe-email">
              Email for updates
            </label>
            <input
              id="footer-subscribe-email"
              type="email"
              className="site-footer__subscribe-input"
              placeholder="Enter your email..."
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
            <button type="submit" className="site-footer__subscribe-btn">
              Subscribe
            </button>
          </form>
        </div>

        <nav className="site-footer__columns" aria-label="Footer">
          <div className="site-footer__col">
            <h2 className="site-footer__heading">Marketplace</h2>
            <Link className="site-footer__link" to="/home">
              Home
            </Link>
            <Link className="site-footer__link" to="/3d-models">
              3D Models
            </Link>
            <Link className="site-footer__link" to="/plugins">
              Plugins
            </Link>
            <Link className="site-footer__link" to="/custom-projects">
              Custom Projects
            </Link>
          </div>
          <div className="site-footer__col">
            <h2 className="site-footer__heading">Resources</h2>
            <Link className="site-footer__link" to="/plugins">
              Blender Plugins
            </Link>
            <Link className="site-footer__link" to="/custom-projects">
              Inquiry Portal
            </Link>
            <Link className="site-footer__link" to="/contact">
              Support
            </Link>
            <Link className="site-footer__link" to="/about">
              About the Studio
            </Link>
          </div>
          <div className="site-footer__col">
            <h2 className="site-footer__heading">Company</h2>
            <Link className="site-footer__link" to="/about">
              About Us
            </Link>
            <Link className="site-footer__link" to="/custom-projects">
              Hire a Freelancer
            </Link>
            <Link className="site-footer__link" to="/contact">
              Contact
            </Link>
          </div>
          <div className="site-footer__col">
            <h2 className="site-footer__heading">Legal & Trust</h2>
            <Link className="site-footer__link" to="/contact">
              Privacy & Terms
            </Link>
            <Link className="site-footer__link" to="/contact">
              Licensing
            </Link>
            <Link className="site-footer__link" to="/contact">
              Security
            </Link>
            <Link className="site-footer__link" to="/about">
              Our Studio
            </Link>
          </div>
        </nav>

        <div className="site-footer__bottom">
          <p className="site-footer__copy">© {year} 3D HUB. All rights reserved.</p>
          <div className="site-footer__social" aria-label="Social links">
            <a
              className="site-footer__social-link"
              href="https://x.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X (Twitter)"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.727-8.924L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a
              className="site-footer__social-link"
              href="https://github.com/Abhay200-web/3d-asset-marketplace"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.586 2 12.253c0 4.537 2.865 8.383 6.839 9.743.5.094.682-.222.682-.493 0-.243-.009-.888-.014-1.743-2.782.62-3.369-1.38-3.369-1.38-.455-1.183-1.11-1.498-1.11-1.498-.908-.638.069-.625.069-.625 1.004.072 1.532 1.06 1.532 1.06.892 1.57 2.341 1.116 2.91.854.091-.662.35-1.116.636-1.372-2.22-.26-4.555-1.143-4.555-5.085 0-1.123.39-2.041 1.029-2.76-.103-.26-.446-1.302.098-2.714 0 0 .84-.277 2.75 1.054A9.27 9.27 0 0 1 12 6.84a9.27 9.27 0 0 1 2.504.347c1.909-1.331 2.748-1.054 2.748-1.054.546 1.412.202 2.454.1 2.714.64.719 1.028 1.637 1.028 2.76 0 3.951-2.339 4.822-4.566 5.076.359.318.679.945.679 1.904 0 1.374-.012 2.482-.012 2.82 0 .273.18.592.688.491C19.138 20.632 22 16.787 22 12.253 22 6.586 17.523 2 12 2z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
