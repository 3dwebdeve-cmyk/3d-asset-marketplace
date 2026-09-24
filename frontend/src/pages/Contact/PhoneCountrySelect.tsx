import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

import {
  getPhoneCountryByIso,
  getPhoneCountryFlagUrl,
  PHONE_COUNTRY_CODES,
} from './contactSchema'

interface PhoneCountrySelectProps {
  id?: string
  value: string
  onChange: (iso: string) => void
}

export function PhoneCountrySelect({
  id = 'phoneCountryCode',
  value,
  onChange,
}: PhoneCountrySelectProps) {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const selected =
    getPhoneCountryByIso(value) ?? getPhoneCountryByIso('IN') ?? PHONE_COUNTRY_CODES[0]

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return PHONE_COUNTRY_CODES
    return PHONE_COUNTRY_CODES.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        item.code.includes(needle) ||
        item.iso.toLowerCase().includes(needle),
    )
  }, [query])

  useEffect(() => {
    if (!isOpen) return

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
        setQuery('')
      }
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        setQuery('')
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const selectedIdx = filtered.findIndex((item) => item.iso === selected.iso)
    setActiveIndex(selectedIdx >= 0 ? selectedIdx : 0)
  }, [isOpen, query, filtered, selected.iso])

  useEffect(() => {
    if (!isOpen) return
    const option = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    )
    option?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, isOpen])

  const selectCountry = (iso: string) => {
    onChange(iso)
    setIsOpen(false)
    setQuery('')
  }

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setIsOpen(true)
    }
  }

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = filtered[activeIndex]
      if (item) selectCountry(item.iso)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(Math.max(filtered.length - 1, 0))
    }
  }

  return (
    <div
      className={`enquiry-phone__country${isOpen ? ' enquiry-phone__country--open' : ''}`}
      ref={rootRef}
    >
      <button
        id={id}
        type="button"
        className="enquiry-phone__trigger"
        aria-label="Country code"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={onTriggerKeyDown}
      >
        <img
          className="enquiry-phone__flag"
          src={getPhoneCountryFlagUrl(selected.iso)}
          alt=""
          width={18}
          height={13}
          loading="lazy"
          decoding="async"
        />
        <span className="enquiry-phone__dial">{selected.code}</span>
        <span className="enquiry-phone__chevron" aria-hidden="true" />
      </button>

      {isOpen ? (
        <div
          className="enquiry-phone__menu"
          role="presentation"
          onKeyDown={onListKeyDown}
        >
          <label className="visually-hidden" htmlFor={`${id}-search`}>
            Search countries
          </label>
          <input
            id={`${id}-search`}
            className="enquiry-phone__search"
            type="search"
            value={query}
            placeholder="Search country"
            autoComplete="off"
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
          />
          <ul
            id={listboxId}
            className="enquiry-phone__list"
            role="listbox"
            aria-label="Country codes"
            ref={listRef}
          >
            {filtered.length === 0 ? (
              <li className="enquiry-phone__empty" role="presentation">
                No countries found
              </li>
            ) : (
              filtered.map((item, index) => {
                const isSelected = item.iso === selected.iso
                const isActive = index === activeIndex
                return (
                  <li key={item.iso} role="presentation">
                    <button
                      type="button"
                      role="option"
                      data-index={index}
                      className={`enquiry-phone__option${isSelected ? ' enquiry-phone__option--selected' : ''}${isActive ? ' enquiry-phone__option--active' : ''}`}
                      aria-selected={isSelected}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectCountry(item.iso)}
                    >
                      <img
                        className="enquiry-phone__flag"
                        src={getPhoneCountryFlagUrl(item.iso)}
                        alt=""
                        width={18}
                        height={13}
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="enquiry-phone__option-name">{item.name}</span>
                      <span className="enquiry-phone__option-code">{item.code}</span>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
