export type PricingMode = 'free' | 'paid'

interface PricingChoiceProps {
  /** Prefix for the input ids; each page section needs its own. */
  idPrefix: string
  /** Group label, so two choices on one page stay distinct. */
  legend?: string
  value: PricingMode
  onChange: (mode: PricingMode) => void
  disabled?: boolean
}

/** Free or Paid for a model. Free is a download without checkout; Paid needs a price. */
export function PricingChoice({
  idPrefix,
  legend = 'Pricing',
  value,
  onChange,
  disabled = false,
}: PricingChoiceProps) {
  return (
    <fieldset className="admin-filters" disabled={disabled}>
      <legend className="form-field__label">{legend}</legend>
      <label className="ui-input" htmlFor={`${idPrefix}-free`}>
        <input
          id={`${idPrefix}-free`}
          type="radio"
          name={`${idPrefix}-pricing`}
          checked={value === 'free'}
          onChange={() => onChange('free')}
        />{' '}
        Free (download without payment)
      </label>
      <label className="ui-input" htmlFor={`${idPrefix}-paid`}>
        <input
          id={`${idPrefix}-paid`}
          type="radio"
          name={`${idPrefix}-pricing`}
          checked={value === 'paid'}
          onChange={() => onChange('paid')}
        />{' '}
        Paid
      </label>
    </fieldset>
  )
}
