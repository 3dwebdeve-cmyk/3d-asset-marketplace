import { describe, expect, it } from 'vitest'

import { dashboardNavItems, isDashboardChromePath } from './dashboardNav'

describe('dashboardNavItems', () => {
  it('starts with an exact-match Dashboard home item', () => {
    expect(dashboardNavItems[0]).toEqual({
      to: '/dashboard',
      label: 'Dashboard',
      icon: 'home',
      end: true,
    })
  })
})

describe('isDashboardChromePath', () => {
  it('matches dashboard and profile routes', () => {
    expect(isDashboardChromePath('/dashboard')).toBe(true)
    expect(isDashboardChromePath('/dashboard/orders')).toBe(true)
    expect(isDashboardChromePath('/dashboard/password')).toBe(true)
    expect(isDashboardChromePath('/profile')).toBe(true)
  })

  it('rejects unrelated paths', () => {
    expect(isDashboardChromePath('/')).toBe(false)
    expect(isDashboardChromePath('/cart')).toBe(false)
    expect(isDashboardChromePath('/home')).toBe(false)
    expect(isDashboardChromePath('/profiles')).toBe(false)
  })
})
