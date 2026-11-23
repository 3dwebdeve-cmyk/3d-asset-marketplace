import { useQuery } from '@tanstack/react-query'

import { listUploaderImports } from '../../api/productsApi'
import { formatDateTime } from '../../lib/format'

/** A new upload shows here within a minute without reloading the page. */
const REFRESH_MS = 60_000

/** The uploader's latest import, so the admin can see why a model in R2 is not in QA.
 * The reason texts come from the server (backend/products/import_reasons.py). */
export function UploaderImportsPanel() {
  const importsQuery = useQuery({
    queryKey: ['admin', 'uploader-imports'],
    queryFn: listUploaderImports,
    refetchInterval: REFRESH_MS,
  })
  const latest = importsQuery.data?.[0]

  if (importsQuery.isError || !latest) {
    return null
  }

  const notImported = latest.skipped + latest.failed

  return (
    <section className="uploader-import" aria-labelledby="uploader-import-title">
      <div className="uploader-import__head">
        <h2 id="uploader-import-title">Last uploader import</h2>
        <time dateTime={latest.created_at}>{formatDateTime(latest.created_at)}</time>
      </div>
      <ul className="uploader-import__stats">
        <li><strong>{latest.created}</strong> new</li>
        <li><strong>{latest.updated}</strong> updated</li>
        <li className={notImported > 0 ? 'is-warning' : undefined}>
          <strong>{notImported}</strong> not imported
        </li>
      </ul>
      {latest.refused.length > 0 ? (
        <details className="uploader-import__refused">
          <summary>Show why</summary>
          <ul aria-label="Models not imported">
            {latest.refused.map((row) => (
              <li key={row.model_id}>
                <strong>{row.model_id}</strong>
                {row.name ? ` (${row.name})` : ''}: {row.text}
                {row.action ? <> <em>Next step:</em> {row.action}</> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
