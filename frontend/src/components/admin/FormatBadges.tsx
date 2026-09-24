export function FormatBadges({ labels }: { labels: readonly string[] }) {
  return (
    <div className="admin-format-badges" aria-label="Supported formats">
      {labels.map((label) => (
        <span key={label} className="admin-format-badge">
          {label}
        </span>
      ))}
    </div>
  )
}
