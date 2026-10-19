import {
  buildPluginMetaDescription,
  buildPluginPageTitle,
  buildPluginStructuredData,
  buildProductMetaDescription,
  buildProductPageTitle,
  buildProductStructuredData,
  DEFAULT_SOCIAL_IMAGE,
  SITE_NAME,
} from '../src/lib/seo'
import { STATIC_PAGE_SEO } from '../src/lib/seoPages'
import type { PublicPluginDetail } from '../src/types/plugin'
import type { PublicProductDetail } from '../src/types/product'

/** Head content for one HTML response. Mirrors what useDocumentSeo sets in the browser. */
export interface PageSeo {
  title: string
  description: string
  keywords?: string[]
  ogType: 'website' | 'product'
  /** Absolute social image URL. Defaults to the site banner. */
  image?: string
  structuredData?: Record<string, unknown>
  status: number
}

/** Catalog slugs as the backend issues them. Anything else is not looked up. */
export const SLUG_PATTERN = /^[A-Za-z0-9_-]{1,200}$/

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

// Tags the browser-side hook also manages. They are removed from the shell and rendered again.
const HEAD_TAGS_TO_REPLACE: readonly RegExp[] = [
  /<title>[\s\S]*?<\/title>\s*/gi,
  /<meta\s+(?:name|property)="(?:description|keywords|og:[a-z_]+|twitter:[a-z_]+)"[^>]*>\s*/gi,
  /<link\s+rel="canonical"[^>]*>\s*/gi,
  /<script\s+type="application\/ld\+json"\s+id="seo-structured-data"[\s\S]*?<\/script>\s*/gi,
]

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)
}

/** Strips trailing slashes so `/plugins/x/` and `/plugins/x` resolve to one page. */
export function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/** Requests for files (`/assets/app.js`, `/favicon.svg`) never get page head tags. */
export function isLikelyAssetPath(pathname: string): boolean {
  const lastSegment = pathname.split('/').pop() ?? ''
  return lastSegment.includes('.')
}

export function getStaticPageSeo(path: string): PageSeo | undefined {
  if (!Object.hasOwn(STATIC_PAGE_SEO, path)) {
    return undefined
  }

  const page = STATIC_PAGE_SEO[path]
  return {
    title: page.title,
    description: page.description,
    keywords: page.keywords,
    ogType: 'website',
    status: 200,
  }
}

function absoluteUrl(value: string, siteOrigin: string): string | undefined {
  if (!value) {
    return undefined
  }

  try {
    return new URL(value, `${siteOrigin}/`).toString()
  } catch {
    return undefined
  }
}

export function getProductPageSeo(product: PublicProductDetail, siteOrigin: string): PageSeo {
  const image = absoluteUrl(product.thumbnail, siteOrigin)
  return {
    title: buildProductPageTitle(product.name),
    description: buildProductMetaDescription(product.name, product.short_description),
    keywords: [product.name, product.category.name, '3D model', 'download 3D model'],
    ogType: 'product',
    image,
    structuredData: buildProductStructuredData({ ...product, thumbnail: image ?? '' }),
    status: 200,
  }
}

export function getPluginPageSeo(plugin: PublicPluginDetail, siteOrigin: string): PageSeo {
  const image = absoluteUrl(plugin.thumbnail, siteOrigin)
  return {
    title: buildPluginPageTitle(plugin.name),
    description: buildPluginMetaDescription(plugin.name, plugin.short_description),
    keywords: [plugin.name, plugin.category.name, '3D plugin', 'download plugin'],
    ogType: 'product',
    image,
    structuredData: buildPluginStructuredData({ ...plugin, thumbnail: image ?? '' }),
    status: 200,
  }
}

/** Unknown or unpublished catalog items answer 404 so search engines drop them. */
export function getNotFoundPageSeo(kind: 'Product' | 'Plugin'): PageSeo {
  return {
    title: `${kind} not found | ${SITE_NAME}`,
    description: `The requested ${kind.toLowerCase()} could not be found.`,
    ogType: 'website',
    status: 404,
  }
}

function metaTag(attribute: 'name' | 'property', key: string, content: string): string {
  return `<meta ${attribute}="${key}" content="${escapeHtml(content)}" />`
}

/**
 * Replaces the SEO head tags in the app shell with ones for this page. Returns the
 * shell unchanged when it has no </head>, so an unexpected response is never corrupted.
 */
export function renderSeoHead(
  html: string,
  seo: PageSeo,
  page: { origin: string; path: string },
): string {
  let shell = html
  for (const pattern of HEAD_TAGS_TO_REPLACE) {
    shell = shell.replace(pattern, '')
  }

  const headEnd = shell.search(/<\/head>/i)
  if (headEnd === -1) {
    return html
  }

  const canonical = new URL(page.path, `${page.origin}/`).toString()
  const image = seo.image ?? new URL(DEFAULT_SOCIAL_IMAGE, `${page.origin}/`).toString()
  const tags = [
    `<title>${escapeHtml(seo.title)}</title>`,
    metaTag('name', 'description', seo.description),
    ...(seo.keywords?.length ? [metaTag('name', 'keywords', seo.keywords.join(', '))] : []),
    metaTag('property', 'og:site_name', SITE_NAME),
    metaTag('property', 'og:type', seo.ogType),
    metaTag('property', 'og:title', seo.title),
    metaTag('property', 'og:description', seo.description),
    metaTag('property', 'og:url', canonical),
    metaTag('property', 'og:image', image),
    metaTag('name', 'twitter:card', 'summary_large_image'),
    metaTag('name', 'twitter:title', seo.title),
    metaTag('name', 'twitter:description', seo.description),
    metaTag('name', 'twitter:image', image),
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
  ]

  if (seo.structuredData) {
    const json = JSON.stringify({
      '@context': 'https://schema.org',
      url: canonical,
      ...seo.structuredData,
    }).replace(/</g, '\\u003c')
    tags.push(
      `<script type="application/ld+json" id="seo-structured-data" data-seo-ssr>${json}</script>`,
    )
  }

  const indented = tags.map((tag) => `    ${tag}`).join('\n')
  return `${shell.slice(0, headEnd)}${indented}\n  ${shell.slice(headEnd)}`
}

/** Sitemap for the indexable paths. `paths` are root-relative and already unique. */
export function buildSitemapXml(origin: string, paths: readonly string[]): string {
  const entries = [...new Set(paths)].map(
    (path) => `  <url><loc>${escapeHtml(new URL(path, `${origin}/`).toString())}</loc></url>`,
  )
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n')
}

/** Adds the absolute sitemap location to robots.txt, which must use a full URL. */
export function appendSitemapLine(robots: string, origin: string): string {
  const base = robots.trimEnd()
  if (/^sitemap:/im.test(base)) {
    return `${base}\n`
  }
  return `${base}\n\nSitemap: ${new URL('/sitemap.xml', `${origin}/`).toString()}\n`
}
