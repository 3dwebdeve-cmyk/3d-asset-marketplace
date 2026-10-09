import { useEffect } from 'react'

interface UseDocumentSeoOptions {
  title: string
  description: string
  /** Optional robots directive (e.g. "noindex, nofollow" for checkout/account pages). */
  robots?: string
}

const DEFAULT_TITLE = 'AssetHive3D'
const META_DESCRIPTION_SELECTOR = 'meta[name="description"]'
const META_ROBOTS_SELECTOR = 'meta[name="robots"]'

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

export function useDocumentSeo({ title, description, robots }: UseDocumentSeoOptions): void {
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
    }
  }, [title, description, robots])
}

export function buildProductPageTitle(productName: string): string {
  return `${productName} | ${DEFAULT_TITLE}`
}

export function buildProductMetaDescription(
  productName: string,
  shortDescription: string,
): string {
  const trimmed = shortDescription.trim()
  if (trimmed) {
    return trimmed.slice(0, 160)
  }
  return `View details for ${productName} on ${DEFAULT_TITLE}.`
}
