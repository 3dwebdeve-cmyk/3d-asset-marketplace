import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { AuthIconField } from './AuthIconField'

describe('AuthIconField', () => {
  it('toggles password visibility without submitting', async () => {
    const user = userEvent.setup()
    render(
      <form>
        <AuthIconField id="secret" label="Password" icon="lock" revealable />
      </form>,
    )

    const input = screen.getByLabelText(/^password$/i)
    expect(input).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: /show password/i }))
    expect(input).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: /hide password/i }))
    expect(input).toHaveAttribute('type', 'password')
  })
})
