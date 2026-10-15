import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const REVEAL_TARGETS = [
  '.browse-category-card', '.product-card', '.plugin-card', '.browse-service-card',
  '.hub-offer__card', '.custom-projects-process__steps > li', '.about-who-card',
  '.about-offer-card', '.auth-card', '.dashboard-card', '.enquiry-form-card',
  '.browse-rail-section__header', '.marketing-section > h2',
  '.about-who__copy', '.about-mission__copy', '.about-offer__header',
  '.enquiry-topics', '.enquiry-faq',
].join(',')

/** Reveal each card once, including cards loaded after a route's lazy boundary. */
export function SiteMotion() {
  const { pathname } = useLocation()

  useEffect(() => {
    const root = document.querySelector('.app-shell')
    if (!root || typeof IntersectionObserver === 'undefined') return
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)')

    const start = () => {
      if (preference?.matches) return () => {}
      const seen = new WeakSet<Element>()
      const animations = new Set<Animation>()
      const observer = new IntersectionObserver((entries) => {
        let index = 0
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          observer.unobserve(entry.target)
          if (entry.target.closest('[inert]') || !entry.target.animate) continue
          const animation = entry.target.animate([
            { opacity: 0.8, translate: '0 8px' },
            { opacity: 1, translate: '0 0' },
          ], {
            duration: 650,
            delay: Math.min(index++, 3) * 25,
            easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            fill: 'backwards',
          })
          animations.add(animation)
          animation.onfinish = () => animations.delete(animation)
        }
      }, { threshold: 0, rootMargin: '0px 0px -12px 0px' })

      const register = (element: Element) => {
        if (!element.matches(REVEAL_TARGETS) || seen.has(element) || element.closest('[inert]')) return
        // Animate one container, not both a card and its parent.
        if (element.parentElement?.closest(REVEAL_TARGETS)) return
        seen.add(element)
        observer.observe(element)
      }
      root.querySelectorAll(REVEAL_TARGETS).forEach(register)
      const mutations = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue
            register(node)
            node.querySelectorAll(REVEAL_TARGETS).forEach(register)
          }
        }
      })
      mutations.observe(root, { childList: true, subtree: true })

      return () => {
        observer.disconnect()
        mutations.disconnect()
        animations.forEach((animation) => animation.cancel())
      }
    }

    let stop = start()
    const onPreferenceChange = () => {
      stop()
      stop = start()
    }
    preference?.addEventListener('change', onPreferenceChange)
    return () => {
      stop()
      preference?.removeEventListener('change', onPreferenceChange)
    }
  }, [pathname])

  return null
}
