import { useEffect } from 'react'

import {
  DEFAULT_OG_IMAGE_PATH,
  SITE_NAME,
  absoluteUrl,
  buildProductDescription,
  buildProductTitle,
} from '../lib/seo'

interface UseDocumentSeoOptions {
  title: string
  description: string
  /** Optional robots directive (e.g. "noindex, nofollow" for checkout/account pages). */
  robots?: string
  /**
   * The page's own clean address (a path such as `/3d-models/furniture`, or a full URL).
   * Sets the canonical link and the social-card URL, so filtered or tracked variants of a page
   * all point back to one address.
   */
  canonicalPath?: string
  /** Social-card image (path or URL). Defaults to the site card. */
  image?: string
  /** Social-card type. */
  type?: 'website' | 'product'
  /** schema.org structured data for this page (one object or several). */
  jsonLd?: object | readonly object[] | null
}

const DEFAULT_TITLE = SITE_NAME
const META_DESCRIPTION_SELECTOR = 'meta[name="description"]'
const META_ROBOTS_SELECTOR = 'meta[name="robots"]'
const JSON_LD_ATTRIBUTE = 'data-seo-jsonld'

type MetaKind = 'name' | 'property'

interface Undo {
  (): void
}

function ensureMetaElement(name: string, selector: string): HTMLMetaElement {
  const existing = document.querySelector(selector)
  if (existing instanceof HTMLMetaElement) {
    return existing
  }

  const meta = document.createElement('meta')
  meta.name = name
  document.head.appendChild(meta)
  return meta
}

/** Set a <meta> tag and return a function that puts the head back as it was. */
function setMeta(kind: MetaKind, key: string, content: string): Undo {
  const selector = `meta[${kind}="${key}"]`
  const existing = document.head.querySelector(selector)
  if (existing instanceof HTMLMetaElement) {
    const previous = existing.content
    existing.content = content
    return () => {
      existing.content = previous
    }
  }
  const meta = document.createElement('meta')
  meta.setAttribute(kind, key)
  meta.content = content
  document.head.appendChild(meta)
  return () => meta.remove()
}

function setCanonical(href: string): Undo {
  const existing = document.head.querySelector('link[rel="canonical"]')
  if (existing instanceof HTMLLinkElement) {
    const previous = existing.href
    existing.href = href
    return () => {
      existing.href = previous
    }
  }
  const link = document.createElement('link')
  link.rel = 'canonical'
  link.href = href
  document.head.appendChild(link)
  return () => link.remove()
}

function setJsonLd(data: object | readonly object[]): Undo {
  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.setAttribute(JSON_LD_ATTRIBUTE, '')
  // "<" is escaped so no value can ever close the script tag early.
  script.textContent = JSON.stringify(data).replace(/</g, '\\u003c')
  document.head.appendChild(script)
  return () => script.remove()
}

export function useDocumentSeo({
  title,
  description,
  robots,
  canonicalPath,
  image,
  type = 'website',
  jsonLd,
}: UseDocumentSeoOptions): void {
  // Structured data goes in as text, so compare it as text to avoid re-running every render.
  const jsonLdText = jsonLd ? JSON.stringify(jsonLd) : ''

  useEffect(() => {
    const previousTitle = document.title
    const descriptionMeta = ensureMetaElement('description', META_DESCRIPTION_SELECTOR)
    const previousDescription = descriptionMeta.content
    const robotsMeta = robots
      ? ensureMetaElement('robots', META_ROBOTS_SELECTOR)
      : null
    const previousRobots = robotsMeta?.content ?? null
    const createdRobots = Boolean(robots && robotsMeta && previousRobots === '')

    document.title = title
    descriptionMeta.content = description
    if (robotsMeta && robots) {
      robotsMeta.content = robots
    }

    const imageUrl = absoluteUrl(image || DEFAULT_OG_IMAGE_PATH)
    const undo: Undo[] = [
      setMeta('property', 'og:title', title),
      setMeta('property', 'og:description', description),
      setMeta('property', 'og:type', type),
      setMeta('property', 'og:site_name', SITE_NAME),
      setMeta('property', 'og:image', imageUrl),
      setMeta('name', 'twitter:card', 'summary_large_image'),
      setMeta('name', 'twitter:title', title),
      setMeta('name', 'twitter:description', description),
      setMeta('name', 'twitter:image', imageUrl),
    ]
    if (canonicalPath) {
      const canonical = absoluteUrl(canonicalPath)
      undo.push(setCanonical(canonical), setMeta('property', 'og:url', canonical))
    }
    if (jsonLdText) {
      undo.push(setJsonLd(JSON.parse(jsonLdText) as object))
    }

    return () => {
      document.title = previousTitle
      descriptionMeta.content = previousDescription
      if (robotsMeta) {
        if (createdRobots) {
          robotsMeta.remove()
        } else if (previousRobots !== null) {
          robotsMeta.content = previousRobots
        }
      }
      for (const restore of undo.reverse()) restore()
    }
  }, [title, description, robots, canonicalPath, image, type, jsonLdText])
}

export function buildProductPageTitle(productName: string, categoryName?: string): string {
  return buildProductTitle(productName, categoryName)
}

export function buildProductMetaDescription(
  productName: string,
  shortDescription: string,
  extras?: { categoryName?: string; polygonCount?: number | null; licenseType?: string },
): string {
  return buildProductDescription(productName, shortDescription, extras)
}

export { DEFAULT_TITLE }
