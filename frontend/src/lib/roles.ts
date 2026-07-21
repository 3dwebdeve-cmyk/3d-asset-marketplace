export const ROLE_ADMINISTRATOR = 'Administrator'
export const ROLE_CUSTOMER = 'Customer'

export function isAdministrator(role: string | null | undefined): boolean {
  return role === ROLE_ADMINISTRATOR
}

/** Customer post-login destination. Administrators use /admin/login separately. */
export function getPostLoginPath(role: string | null | undefined): string {
  return isAdministrator(role) ? '/admin/login' : '/dashboard'
}
