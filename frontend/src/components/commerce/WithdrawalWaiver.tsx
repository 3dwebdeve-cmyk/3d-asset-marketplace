import { useId, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { REFUND_POLICY_PATH } from '../../lib/legalDocuments'
import '../../styles/withdrawal-waiver.css'

export const WITHDRAWAL_WAIVER_LABEL =
  'I want immediate access to my files. I understand I lose my 14-day right to cancel once they are available, and I agree to the'

/**
 * The checkbox every Buy / Checkout button needs before paying. EU and UK buyers keep a 14-day
 * right to cancel a digital purchase unless they agree, before paying, to get the files at once
 * and give that right up. The checkout API refuses a request without it and records the consent
 * on the order.
 *
 * `confirm()` returns true when ticked; otherwise it shows the message and focuses the box.
 */
export function useWithdrawalWaiver(): { confirm: () => boolean; field: ReactNode } {
  const [checked, setChecked] = useState(false)
  const [missing, setMissing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const errorId = `${id}-error`

  const confirm = () => {
    if (checked) return true
    setMissing(true)
    inputRef.current?.focus()
    return false
  }

  const field = (
    <div className={`withdrawal-waiver${missing ? ' withdrawal-waiver--missing' : ''}`}>
      <div className="withdrawal-waiver__row">
        <input
          ref={inputRef}
          id={id}
          type="checkbox"
          className="withdrawal-waiver__check"
          checked={checked}
          aria-invalid={missing || undefined}
          aria-describedby={missing ? errorId : undefined}
          onChange={(event) => {
            setChecked(event.target.checked)
            if (event.target.checked) setMissing(false)
          }}
        />
        <label htmlFor={id} className="withdrawal-waiver__label">
          {WITHDRAWAL_WAIVER_LABEL}{' '}
          <Link className="auth-link" to={REFUND_POLICY_PATH} target="_blank" rel="noreferrer">
            Refund Policy
          </Link>
          .
        </label>
      </div>
      {missing ? (
        <p id={errorId} className="withdrawal-waiver__error" role="alert">
          Tick this box to continue to payment.
        </p>
      ) : null}
    </div>
  )

  return { confirm, field }
}
