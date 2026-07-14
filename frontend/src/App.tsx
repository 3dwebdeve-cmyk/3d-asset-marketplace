import { Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { ErrorBoundary } from './components/ErrorBoundary'
import { Spinner } from './components/ui/Spinner'
import { useSessionBootstrap } from './hooks/useSessionBootstrap'
import { DashboardPage } from './pages/Dashboard/DashboardPage'
import { HomePage } from './pages/Home/HomePage'
import { LoginPage } from './pages/Login/LoginPage'
import { RegisterPage } from './pages/Register/RegisterPage'
import { ProtectedRoute } from './routes/ProtectedRoute'
import './App.css'
import './styles/auth.css'

function App() {
  const isReady = useSessionBootstrap()

  if (!isReady) {
    return <Spinner fullPage label="Restoring your session..." />
  }

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Suspense fallback={<Spinner fullPage />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<DashboardPage />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  )
}

export default App
