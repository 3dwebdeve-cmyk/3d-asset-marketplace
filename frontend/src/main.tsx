import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/fonts.css'
import './index.css'
import './styles/toast.css'
import App from './App.tsx'
import { Toaster } from './components/ui/Toaster'
import { initFrontendSentry, reactRootErrorHandlers } from './lib/sentry'
import { LegalVersionBootstrap } from './components/LegalVersionBootstrap'

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

createRoot(document.getElementById('root')!, reactRootErrorHandlers()).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LegalVersionBootstrap><App /></LegalVersionBootstrap>
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
)
