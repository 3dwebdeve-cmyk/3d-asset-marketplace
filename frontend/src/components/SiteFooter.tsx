import { Link } from 'react-router-dom'

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <nav className="site-footer__nav" aria-label="Footer">
          <Link className="site-footer__link" to="/about">
            About
          </Link>
          <Link className="site-footer__link" to="/contact">
            Contact
          </Link>
          <Link className="site-footer__link" to="/custom-projects">
            Custom Projects
          </Link>
          <Link className="site-footer__link" to="/products">
            Browse Models
          </Link>
          <Link className="site-footer__link" to="/plugins">
            Plugins
          </Link>
        </nav>
        <p className="site-footer__copy">
          © {year} 3D Asset Marketplace. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
