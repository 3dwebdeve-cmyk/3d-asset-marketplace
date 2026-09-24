import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Sentry from '@sentry/react'
import './index.css'
import './styles/toast.css'
import App from './App.tsx'
import { Toaster } from './components/ui/Toaster'
import { initFrontendSentry } from './lib/sentry'

initFrontendSentry()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Catalog and dashboard reads change infrequently; avoid refetch storms on focus/remount.
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!, {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
}).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
)
