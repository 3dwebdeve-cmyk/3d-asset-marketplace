import { Link } from 'react-router-dom'

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand-col">
          <Link className="site-footer__brand" to="/">
            <img src="/images/AssetHive%203D.svg?v=2" alt="AssetHive3D" />
          </Link>
          <p className="site-footer__blurb">
            AssetHive3D is a marketplace for furniture and interior 3D models, with Blender and
            Unreal plugins and custom 3D work for studios and creators.
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
              Blender & Unreal Plugins
            </Link>
            <Link className="site-footer__link" to="/custom-projects">
              Custom Projects
            </Link>
          </div>
          <div className="site-footer__col">
            <h2 className="site-footer__heading">3D Model Categories</h2>
            <Link className="site-footer__link" to="/3d-models/furniture">
              Furniture 3D Models
            </Link>
            <Link className="site-footer__link" to="/3d-models/interior-3d-models">
              Interior 3D Models
            </Link>
            <Link className="site-footer__link" to="/3d-models/household">
              Household 3D Models
            </Link>
            <Link className="site-footer__link" to="/3d-models/lights">
              Lighting 3D Models
            </Link>
            <Link className="site-footer__link" to="/3d-models/plants-vegetation">
              Plant 3D Models
            </Link>
            <Link className="site-footer__link" to="/categories">
              All Categories
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
          <p className="site-footer__copy">© {year} AssetHive3D. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
