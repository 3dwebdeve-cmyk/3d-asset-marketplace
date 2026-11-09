import { useQuery } from '@tanstack/react-query'

import { listUploaderImports } from '../../api/productsApi'
import { formatDateTime } from '../../lib/format'

/** What to fix for the common reasons; any other reason is shown as its code. */
const REASON_HELP: Record<string, string> = {
  published_sku: 'already published, left as it is',
  invalid_r2_prefix: 'files must be under models/<ID>/ or free-models/<ID>/',
  qa_not_ready: 'QA status in the uploader is not "Ready for QA"',
  folder_mismatch: 'the uploader could not match the model folder',
  category_unmapped: 'category not found on the website',
  missing_glb_checksum: 'no GLB checksum sent',
  missing_package_object: 'zip not found in R2',
  missing_preview_object: 'preview .glb not found in R2',
  missing_thumbnail_object: 'thumbnail not found in R2',
  preview_not_reduced: 'preview .glb is not reduced enough',
  preview_too_large: 'preview .glb is too large',
  invalid_object_key: 'a file key is outside the model folder',
}

/** The uploader's latest imports, so the admin can see why a model in R2 is not in QA. */
export function UploaderImportsPanel() {
  const importsQuery = useQuery({ queryKey: ['admin', 'uploader-imports'], queryFn: listUploaderImports })
  const imports = importsQuery.data ?? []

  if (importsQuery.isError || imports.length === 0) {
    return null
  }

  return (
    <section className="admin-create-form" aria-labelledby="uploader-imports-title">
      <h2 id="uploader-imports-title">Recent uploader imports</h2>
      <ul>
        {imports.map((entry) => {
          const { created = 0, updated = 0, skipped = 0, failed = 0, skipped_reasons = {} } = entry.metadata
          return (
            <li key={entry.id}>
              {formatDateTime(entry.created_at)}: {created} new, {updated} updated to QA, {skipped + failed} not
              imported
              {Object.keys(skipped_reasons).length > 0 ? (
                <ul>
                  {Object.entries(skipped_reasons).map(([modelId, reason]) => (
                    <li key={modelId}>
                      {modelId}: {REASON_HELP[reason] ?? reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
