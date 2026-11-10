export type AdminIconName =
  | 'tag'
  | 'plus-circle'
  | 'filter'
  | 'folder'
  | 'clock'
  | 'check'
  | 'trash'
  | 'home'
  | 'box'
  | 'archive'
  | 'check-square'
  | 'puzzle'
  | 'layers'
  | 'users'
  | 'user'
  | 'cart'
  | 'card'
  | 'star'
  | 'download'
  | 'chart'
  | 'shield'
  | 'settings'
  | 'help'
  | 'search'
  | 'bell'
  | 'chevron-down'
  | 'database'
  | 'link'
  | 'check-circle'

const PATHS: Record<AdminIconName, string[]> = {
  'plus-circle': ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 8v8', 'M8 12h8'],
  filter: ['M3 4h18l-7 8v7l-4 2v-9L3 4Z'],
  folder: ['M3 7V5h6l2 2h10v13H3V7Z'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5l4 2'],
  check: ['m4 12 5 5L20 6'],
  trash: ['M3 6h18', 'M9 6V3h6v3', 'M5 6l1 15h12l1-15', 'M10 10v7', 'M14 10v7'],
  home: ['M3 11.5 12 4l9 7.5', 'M5 10v10h5v-6h4v6h5V10'],
  box: ['M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z', 'M4 7.5 12 12l8-4.5', 'M12 12v9'],
  archive: ['M4 4h16v5H4z', 'M5 9v11h14V9', 'M10 13h4'],
  'check-square': ['M4 4h16v16H4z', 'm8.5 12.5 2.5 2.5 4.5-5'],
  puzzle: [
    'M10 4a2 2 0 1 1 4 0v2h4v4h-2a2 2 0 1 0 0 4h2v4h-4v-2a2 2 0 1 0-4 0v2H6v-4H4a2 2 0 1 1 0-4h2V6h4V4Z',
  ],
  layers: ['m12 3 9 5-9 5-9-5 9-5Z', 'm3 13 9 5 9-5', 'm3 17.5 9 5 9-5'],
  users: [
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    'M2.5 20a6.5 6.5 0 0 1 13 0',
    'M16 4.5a3.5 3.5 0 0 1 0 6.5',
    'M18 14.5a6.5 6.5 0 0 1 3.5 5.5',
  ],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4 21a8 8 0 0 1 16 0'],
  cart: ['M3 4h2.5l2 11h11l2-8H7', 'M9 20h.01', 'M17 20h.01'],
  card: ['M3 6h18v12H3z', 'M3 10h18', 'M6.5 15h3'],
  star: ['m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z'],
  download: ['M12 4v11', 'm7.5 11 4.5 4.5 4.5-4.5', 'M4 20h16'],
  chart: ['M5 20V11', 'M12 20V5', 'M19 20v-7', 'M3 20h18'],
  shield: ['M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6L12 3Z', 'm9 12 2.2 2.2L15.5 10'],
  settings: [
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  ],
  help: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7', 'M12 17h.01'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'm20 20-4-4'],
  bell: ['M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z', 'M10 21h4'],
  'chevron-down': ['m6 9 6 6 6-6'],
  database: ['M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3Z', 'M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5', 'M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1'],
  'check-circle': ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'm8.5 12.5 2.5 2.5 4.5-5'],
  tag: ['M3 12.5V4h8.5l9 9-8.5 8.5-9-9Z', 'M7.5 8h.01'],
}

/** Decorative stroke icon; always hidden from assistive tech. */
export function AdminIcon({ name, size = 20 }: { name: AdminIconName; size?: number }) {
  return (
    <svg
      className="admin-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

const NAV_ICONS: Record<string, AdminIconName> = {
  Dashboard: 'home',
  Products: 'box',
  Archived: 'archive',
  'QA queue': 'check-square',
  Plugins: 'puzzle',
  Categories: 'layers',
  Users: 'users',
  Orders: 'cart',
  Payments: 'card',
  Reviews: 'star',
  Downloads: 'download',
  Analytics: 'chart',
  Security: 'shield',
  Pricing: 'tag',
}

export function navIconFor(label: string): AdminIconName {
  return NAV_ICONS[label] ?? 'box'
}
