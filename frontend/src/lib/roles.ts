import { ADMIN_LOGIN } from '../config/adminPaths'

export const ROLE_ADMINISTRATOR = 'Administrator'
export const ROLE_CUSTOMER = 'Customer'

export function isAdministrator(role: string | null | undefined): boolean {
  return role === ROLE_ADMINISTRATOR
}

/** Customer post-login destination. Administrators use the console login separately. */
export function getPostLoginPath(role: string | null | undefined): string {
  return isAdministrator(role) ? ADMIN_LOGIN : '/dashboard'
}
