const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => {
      if (element.getAttribute('aria-hidden') === 'true') {
        return false
      }
      const style = window.getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden'
    },
  )
}

/** Keep Tab / Shift+Tab cycling inside `container`. Returns true when handled. */
export function trapFocusKeyDown(event: KeyboardEvent, container: HTMLElement): boolean {
  if (event.key !== 'Tab') {
    return false
  }

  const focusable = getFocusableElements(container)
  if (focusable.length === 0) {
    event.preventDefault()
    container.focus()
    return true
  }

  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  const active = document.activeElement

  if (event.shiftKey) {
    if (active === first || !container.contains(active)) {
      event.preventDefault()
      last.focus()
      return true
    }
    return false
  }

  if (active === last || !container.contains(active)) {
    event.preventDefault()
    first.focus()
    return true
  }

  return false
}
