import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import {
  downloadCustomerProjectDelivery,
  listCustomerProjectDeliveries,
} from '../../api/customProjectsApi'
import {
  PROJECT_DELIVERY_PAGE_SIZE,
  ProjectDeliveriesList,
} from '../../components/projects/ProjectDeliveriesList'
import type { ProjectDelivery } from '../../types/customProject'
import { getApiErrorMessage } from '../../lib/apiError'

interface CustomerProjectDeliveriesSectionProps {
  projectId: string
}

export function CustomerProjectDeliveriesSection({
  projectId,
}: CustomerProjectDeliveriesSectionProps) {
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const deliveriesQuery = useQuery({
    queryKey: ['customer', 'custom-projects', projectId, 'deliveries'],
    queryFn: () =>
      listCustomerProjectDeliveries(projectId, {
        page: 1,
        page_size: PROJECT_DELIVERY_PAGE_SIZE,
      }),
    enabled: Boolean(projectId),
    retry: false,
  })

  const onDownload = async (delivery: ProjectDelivery) => {
    setDownloadError(null)
    try {
      await downloadCustomerProjectDelivery(projectId, delivery.id, delivery.file_name)
    } catch (error) {
      setDownloadError(
        getApiErrorMessage(error, 'Could not download the deliverable. Please try again.'),
      )
    }
  }

  return (
    <section className="admin-media-section" aria-labelledby="project-deliveries-title">
      <h2 id="project-deliveries-title">Deliverables</h2>
      <ProjectDeliveriesList
        titleId="project-deliveries-title"
        deliveries={deliveriesQuery.data?.results ?? []}
        isLoading={deliveriesQuery.isLoading}
        isError={deliveriesQuery.isError}
        isFetching={deliveriesQuery.isFetching}
        error={deliveriesQuery.error}
        emptyMessage="No deliverables yet. Your designer will upload final files here when ready."
        downloadError={downloadError}
        onRetry={() => void deliveriesQuery.refetch()}
        onDownload={(delivery) => void onDownload(delivery)}
      />
    </section>
  )
}
