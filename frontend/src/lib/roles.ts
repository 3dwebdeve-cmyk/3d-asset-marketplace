export const ROLE_ADMINISTRATOR = 'Administrator'
export const ROLE_CUSTOMER = 'Customer'

export function isAdministrator(role: string | null | undefined): boolean {
  return role === ROLE_ADMINISTRATOR
}
