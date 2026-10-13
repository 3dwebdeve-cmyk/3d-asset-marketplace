import { Link } from 'react-router-dom'

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand-col">
          <Link className="site-footer__brand" to="/">
            <img src="/images/AssetHive%203D.svg?v=2" alt="AssetHive 3D" />
          </Link>
          <p className="site-footer__blurb">
            The world&apos;s premium 3D model marketplace for creators, game developers,
            animators, and VFX studios worldwide.
          </p>
        </div>

        <nav className="site-footer__columns" aria-label="Footer">
          <div className="site-footer__col">
            <h2 className="site-footer__heading">Marketplace</h2>
            <Link className="site-footer__link" to="/">
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
            <Link className="site-footer__link" to="/terms">
              Terms of Service
            </Link>
            <Link className="site-footer__link" to="/privacy">
              Privacy Policy
            </Link>
            <Link className="site-footer__link" to="/contact">
              Security & support
            </Link>
            <Link className="site-footer__link" to="/about">
              Our Studio
            </Link>
          </div>
        </nav>

        <div className="site-footer__bottom">
          <p className="site-footer__copy">© {year} AssetHive 3D. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
