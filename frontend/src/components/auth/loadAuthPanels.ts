// The sign-in and register forms pull in the form and validation libraries (react-hook-form and
// zod), about a fifth of the site's main JavaScript. Most visitors never open them, so they are
// downloaded on first use. Login and Sign up buttons call preloadAuthPanels when the pointer or
// keyboard reaches them, so the forms are usually ready before the click.

type AuthPanelsModule = typeof import('./authPanels')

let panels: Promise<AuthPanelsModule> | null = null
let loaded: AuthPanelsModule | null = null

/** The forms if they have already arrived, so an open dialog can show them without waiting. */
export function loadedAuthPanels(): AuthPanelsModule | null {
  return loaded
}

export function loadAuthPanels(): Promise<AuthPanelsModule> {
  if (!panels) {
    panels = import('./authPanels').then((module) => {
      loaded = module
      return module
    }, (error: unknown) => {
      // Let the next attempt try again, for example after a dropped connection.
      panels = null
      throw error
    })
  }
  return panels
}

export function preloadAuthPanels(): void {
  loadAuthPanels().catch(() => {})
}
