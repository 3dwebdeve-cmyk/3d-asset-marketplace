import type { KeyboardEvent } from 'react'

/**
 * Lets a non-button element (such as a listbox option) be activated with the
 * keyboard. Enter and Space trigger the element's own click handler.
 */
export function activateOnKey(event: KeyboardEvent<HTMLElement>): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    event.currentTarget.click()
  }
}
