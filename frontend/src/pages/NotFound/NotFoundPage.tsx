import { useEffect, useId } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { useRegisterNotFoundPage } from '../../hooks/useNotFoundChrome'
import '../../styles/not-found.css'

export function NotFoundPage() {
  const navigate = useNavigate()
  const reactId = useId().replace(/:/g, '')
  const octClipId = `not-found-oct-${reactId}`
  const coneClipId = `not-found-cone-${reactId}`

  useRegisterNotFoundPage()

  useDocumentSeo({
    title: '404 - Page Not Found',
    description: 'The requested page could not be found. Search the marketplace or return home.',
    robots: 'noindex, nofollow',
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        navigate('/')
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  return (
    <main className="not-found-page">
      <div className="not-found-page__wrapper">
        <div className="not-found-page__illustration" aria-hidden="true">
          <svg
            className="not-found-page__svg"
            viewBox="0 0 280 240"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <clipPath id={octClipId}>
                <polygon points="112,18 168,18 206,56 206,112 168,150 112,150 74,112 74,56" />
              </clipPath>
              <clipPath id={coneClipId}>
                <path d="M 115 119 C 117 119 118 120.5 118.6 123 L 138 221 C 138.5 223 137 225 135 225 L 95 225 C 93 225 91.5 223 92 221 L 111.4 123 C 112 120.5 113 119 115 119 Z" />
              </clipPath>
            </defs>

            <g stroke="#223c68" strokeWidth="3.5" strokeLinecap="round">
              <line x1="38" y1="228" x2="58" y2="228" />
              <line x1="72" y1="228" x2="182" y2="228" />
              <line x1="196" y1="228" x2="212" y2="228" />
              <line x1="222" y1="228" x2="236" y2="228" />
            </g>

            <rect x="136" y="142" width="8" height="86" rx="1" fill="#223c68" />

            <g className="not-found-page__sign">
              <polygon
                points="112,18 168,18 206,56 206,112 168,150 112,150 74,112 74,56"
                fill="#385b9f"
              />
              <g clipPath={`url(#${octClipId})`}>
                <polygon points="60,160 220,160 60,0" fill="#29457d" opacity="0.38" />
              </g>
              <polygon
                points="114,23.5 166,23.5 200.5,58 200.5,110 166,144.5 114,144.5 79.5,110 79.5,58"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              <text
                x="140"
                y="95"
                textAnchor="middle"
                fontFamily="'Plus Jakarta Sans', -apple-system, sans-serif"
                fontWeight="800"
                fontSize="34"
                fill="#ffffff"
                letterSpacing="0.5"
              >
                404
              </text>
            </g>

            <g>
              <path
                d="M 88 230 L 142 230 C 143.5 230 144 228.8 143.2 227.8 L 139 222 C 138.4 221.2 137.5 220.8 136.5 220.8 L 93.5 220.8 C 92.5 220.8 91.6 221.2 91 222 L 86.8 227.8 C 86 228.8 86.5 230 88 230 Z"
                fill="#223c68"
              />
              <g clipPath={`url(#${coneClipId})`}>
                <rect x="85" y="115" width="30" height="115" fill="#3c61a7" />
                <rect x="115" y="115" width="30" height="115" fill="#2b4780" />
                <rect x="85" y="157" width="30" height="14" fill="#ffffff" />
                <rect x="115" y="157" width="30" height="14" fill="#e2e8f5" />
                <rect x="85" y="184" width="30" height="16" fill="#ffffff" />
                <rect x="115" y="184" width="30" height="16" fill="#e2e8f5" />
              </g>
            </g>
          </svg>
        </div>

        <h1 className="not-found-page__title">Page Not Found</h1>
        <p className="not-found-page__description">
          You can search for the page you want here
          <br />
          or return to the{' '}
          <Link to="/" className="not-found-page__home-link">
            homepage
          </Link>
          .
        </p>
      </div>
    </main>
  )
}
