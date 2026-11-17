import { useQuery } from '@tanstack/react-query'

import { listUploaderImports } from '../../api/productsApi'
import { formatDateTime } from '../../lib/format'

/** A new upload shows here within a minute without reloading the page. */
const REFRESH_MS = 60_000

/** The uploader's latest imports, so the admin can see why a model in R2 is not in QA.
 * The reason texts come from the server (backend/products/import_reasons.py). */
export function UploaderImportsPanel() {
  const importsQuery = useQuery({
    queryKey: ['admin', 'uploader-imports'],
    queryFn: listUploaderImports,
    refetchInterval: REFRESH_MS,
  })
  const imports = importsQuery.data ?? []

  if (importsQuery.isError || imports.length === 0) {
    return null
  }

  return (
    <section className="admin-create-form" aria-labelledby="uploader-imports-title">
      <h2 id="uploader-imports-title">Recent uploader imports</h2>
      <ul>
        {imports.map((entry) => (
          <li key={entry.id}>
            {formatDateTime(entry.created_at)}: {entry.created} new, {entry.updated} updated to QA,{' '}
            {entry.skipped + entry.failed} not imported
            {entry.refused.length > 0 ? (
              <ul aria-label={`Models not imported on ${formatDateTime(entry.created_at)}`}>
                {entry.refused.map((row) => (
                  <li key={row.model_id}>
                    <strong>{row.model_id}</strong>
                    {row.name ? ` (${row.name})` : ''}: {row.text}
                    {row.action ? <> <em>Next step:</em> {row.action}</> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
