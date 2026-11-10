const pad = (value: number) => String(value).padStart(2, '0')

/** ISO UTC string from the server -> value for <input type="datetime-local"> in the viewer's time zone. */
export function utcToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** datetime-local value (viewer's time zone) -> ISO UTC string for the server; null when empty or invalid. */
export function localInputToUtc(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** True when the datetime-local value is not in the future. */
export function isLocalInputInPast(value: string, now: number = Date.now()): boolean {
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.getTime() <= now
}
