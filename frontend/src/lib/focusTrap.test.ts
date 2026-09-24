import { describe, expect, it } from 'vitest'

import { getFocusableElements, trapFocusKeyDown } from './focusTrap'

function mountDialog(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.appendChild(root)
  const dialog = root.querySelector<HTMLElement>('[role="dialog"]')
  if (!dialog) {
    throw new Error('Expected a dialog in fixture HTML.')
  }
  return dialog
}

describe('focusTrap', () => {
  it('lists visible focusable controls', () => {
    const dialog = mountDialog(`
      <section role="dialog">
        <button type="button">Close</button>
        <input type="text" />
        <button type="button" disabled>Disabled</button>
        <input type="hidden" value="x" />
        <a href="/help">Help</a>
      </section>
    `)

    const labels = getFocusableElements(dialog).map((el) => el.textContent || el.tagName)
    expect(labels).toEqual(['Close', 'INPUT', 'Help'])
  })

  it('cycles Tab from last to first and Shift+Tab from first to last', () => {
    const dialog = mountDialog(`
      <section role="dialog">
        <button type="button" id="first">First</button>
        <button type="button" id="last">Last</button>
      </section>
    `)
    const first = dialog.querySelector<HTMLElement>('#first')!
    const last = dialog.querySelector<HTMLElement>('#last')!

    last.focus()
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    expect(trapFocusKeyDown(tabEvent, dialog)).toBe(true)
    expect(tabEvent.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)

    first.focus()
    const shiftTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    expect(trapFocusKeyDown(shiftTab, dialog)).toBe(true)
    expect(shiftTab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)
  })
})
