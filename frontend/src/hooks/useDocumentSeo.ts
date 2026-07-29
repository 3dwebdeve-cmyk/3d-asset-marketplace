import { useEffect } from 'react'

interface UseDocumentSeoOptions {
  title: string
  description: string
}

const DEFAULT_TITLE = '3D Asset Marketplace'
const META_DESCRIPTION_SELECTOR = 'meta[name="description"]'

function ensureMetaDescriptionElement(): HTMLMetaElement {
  const existing = document.querySelector(META_DESCRIPTION_SELECTOR)
  if (existing instanceof HTMLMetaElement) {
    return existing
  }

  const meta = document.createElement('meta')
  meta.name = 'description'
  document.head.appendChild(meta)
  return meta
}

export function useDocumentSeo({ title, description }: UseDocumentSeoOptions): void {
  useEffect(() => {
    const previousTitle = document.title
    const meta = ensureMetaDescriptionElement()
    const previousDescription = meta.content

    document.title = title
    meta.content = description

    return () => {
      document.title = previousTitle
      meta.content = previousDescription
    }
  }, [title, description])
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
