import { useEffect } from 'react'

import { DEFAULT_SOCIAL_IMAGE, SITE_NAME } from '../lib/seo'

export interface UseDocumentSeoOptions {
  /** Page title. Omit to keep the title a parent route already set. */
  title?: string
  /** Meta description. Omit to leave the current description alone. */
  description?: string
  /** Optional robots directive (e.g. "noindex, nofollow" for checkout/account pages). */
  robots?: string
  /** Search keywords for the keywords meta tag. */
  keywords?: string[]
  /** Social preview image, root-relative or absolute. Defaults to the site banner. */
  image?: string
  /** Open Graph type. Use "product" for individual listings. */
  ogType?: 'website' | 'product'
  /** schema.org structured data. `@context` and the canonical `url` are added automatically. */
  structuredData?: Record<string, unknown>
}

type Cleanup = () => void

interface HeadTagTarget {
  tag: 'meta' | 'link'
  /** Selector that finds an existing tag, e.g. `meta[name="description"]`. */
  selector: string
  /** Attributes applied when the tag has to be created. */
  attributes: Record<string, string>
  valueAttribute: 'content' | 'href'
}

const STRUCTURED_DATA_ID = 'seo-structured-data'

/** Site origin used for canonical and social URLs. Set VITE_SITE_URL in production. */
function getSiteOrigin(): string {
  const configured = import.meta.env.VITE_SITE_URL?.trim()
  return (configured || window.location.origin).replace(/\/+$/, '')
}

function absoluteUrl(pathOrUrl: string): string {
  return new URL(pathOrUrl, `${getSiteOrigin()}/`).toString()
}

/**
 * Sets one head tag and records how to undo it. Existing tags are restored to their
 * previous value on cleanup; tags created for this page are removed.
 */
function upsertHeadTag(target: HeadTagTarget, value: string, cleanups: Cleanup[]): void {
  const existing = document.head.querySelector(target.selector)
  const element = existing ?? document.createElement(target.tag)
  if (!existing) {
    for (const [name, attributeValue] of Object.entries(target.attributes)) {
      element.setAttribute(name, attributeValue)
    }
    document.head.appendChild(element)
  }

  const previous = element.getAttribute(target.valueAttribute)
  element.setAttribute(target.valueAttribute, value)

  cleanups.push(() => {
    if (!existing) {
      element.remove()
    } else if (previous === null) {
      element.removeAttribute(target.valueAttribute)
    } else {
      element.setAttribute(target.valueAttribute, previous)
    }
  })
}

function metaTarget(attr: 'name' | 'property', key: string): HeadTagTarget {
  return {
    tag: 'meta',
    selector: `meta[${attr}="${key}"]`,
    attributes: { [attr]: key },
    valueAttribute: 'content',
  }
}

function setStructuredData(json: string | null, cleanups: Cleanup[]): void {
  if (!json) {
    return
  }

  // Drop the copy the server rendered into the HTML (see worker/seo.ts) so only one remains.
  document.getElementById(STRUCTURED_DATA_ID)?.remove()
  const script = document.createElement('script')
  script.id = STRUCTURED_DATA_ID
  script.type = 'application/ld+json'
  // Escape "<" so the JSON cannot close the script element early.
  script.textContent = json.replace(/</g, '\\u003c')
  document.head.appendChild(script)
  cleanups.push(() => script.remove())
}

export function useDocumentSeo({
  title,
  description,
  robots,
  keywords,
  image,
  ogType = 'website',
  structuredData,
}: UseDocumentSeoOptions): void {
  const keywordsContent = keywords?.length ? keywords.join(', ') : undefined
  const canonicalUrl = absoluteUrl(window.location.pathname.replace(/\/+$/, '') || '/')
  const imageUrl = absoluteUrl(image ?? DEFAULT_SOCIAL_IMAGE)
  const structuredDataJson = structuredData
    ? JSON.stringify({ '@context': 'https://schema.org', url: canonicalUrl, ...structuredData })
    : null

  useEffect(() => {
    const cleanups: Cleanup[] = []

    const previousTitle = document.title
    if (title !== undefined) {
      document.title = title
      cleanups.push(() => {
        document.title = previousTitle
      })
    }
    const pageTitle = title ?? previousTitle

    if (description !== undefined) {
      upsertHeadTag(metaTarget('name', 'description'), description, cleanups)
    }
    if (robots) {
      upsertHeadTag(metaTarget('name', 'robots'), robots, cleanups)
    }
    if (keywordsContent) {
      upsertHeadTag(metaTarget('name', 'keywords'), keywordsContent, cleanups)
    }

    upsertHeadTag(metaTarget('property', 'og:site_name'), SITE_NAME, cleanups)
    upsertHeadTag(metaTarget('property', 'og:type'), ogType, cleanups)
    upsertHeadTag(metaTarget('property', 'og:title'), pageTitle, cleanups)
    upsertHeadTag(metaTarget('property', 'og:url'), canonicalUrl, cleanups)
    upsertHeadTag(metaTarget('property', 'og:image'), imageUrl, cleanups)
    if (description !== undefined) {
      upsertHeadTag(metaTarget('property', 'og:description'), description, cleanups)
    }

    upsertHeadTag(metaTarget('name', 'twitter:card'), 'summary_large_image', cleanups)
    upsertHeadTag(metaTarget('name', 'twitter:title'), pageTitle, cleanups)
    upsertHeadTag(metaTarget('name', 'twitter:image'), imageUrl, cleanups)
    if (description !== undefined) {
      upsertHeadTag(metaTarget('name', 'twitter:description'), description, cleanups)
    }

    upsertHeadTag(
      {
        tag: 'link',
        selector: 'link[rel="canonical"]',
        attributes: { rel: 'canonical' },
        valueAttribute: 'href',
      },
      canonicalUrl,
      cleanups,
    )

    setStructuredData(structuredDataJson, cleanups)

    return () => {
      for (const cleanup of cleanups.reverse()) {
        cleanup()
      }
    }
  }, [
    title,
    description,
    robots,
    keywordsContent,
    imageUrl,
    ogType,
    canonicalUrl,
    structuredDataJson,
  ])
}

export { buildProductMetaDescription, buildProductPageTitle } from '../lib/seo'
