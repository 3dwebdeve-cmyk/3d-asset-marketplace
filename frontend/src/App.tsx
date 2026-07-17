import { Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { ErrorBoundary } from './components/ErrorBoundary'
import { Navbar } from './components/Navbar'
import { Spinner } from './components/ui/Spinner'
import { useSessionBootstrap } from './hooks/useSessionBootstrap'
import { AdminDashboardPage } from './pages/Admin/AdminDashboardPage'
import { AdminLoginPage } from './pages/Admin/AdminLoginPage'
import { AdminUserDetailPage } from './pages/Admin/AdminUserDetailPage'
import { AdminUsersPage } from './pages/Admin/AdminUsersPage'
import { DashboardPage } from './pages/Dashboard/DashboardPage'
import { EmailVerificationPage } from './pages/EmailVerification/EmailVerificationPage'
import { EmailVerificationResendPage } from './pages/EmailVerification/EmailVerificationResendPage'
import { HomePage } from './pages/Home/HomePage'
import { LoginPage } from './pages/Login/LoginPage'
import { PasswordResetConfirmPage } from './pages/PasswordReset/PasswordResetConfirmPage'
import { PasswordResetRequestPage } from './pages/PasswordReset/PasswordResetRequestPage'
import { ProfilePage } from './pages/Profile/ProfilePage'
import { RegisterPage } from './pages/Register/RegisterPage'
import { AdminRoute } from './routes/AdminRoute'
import { ProtectedRoute } from './routes/ProtectedRoute'
import './App.css'
import './styles/auth.css'
import './styles/navbar.css'

function App() {
  const isReady = useSessionBootstrap()

  if (!isReady) {
    return <Spinner fullPage label="Restoring your session..." />
  }

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Navbar />
        <div className="app-shell">
          <Suspense fallback={<Spinner fullPage />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/forgot-password" element={<PasswordResetRequestPage />} />
              <Route
                path="/reset-password/:uid/:token"
                element={<PasswordResetConfirmPage />}
              />
              <Route path="/verify-email/resend" element={<EmailVerificationResendPage />} />
              <Route
                path="/verify-email/:uid/:token"
                element={<EmailVerificationPage />}
              />
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminDashboardPage />} />
                <Route path="/admin/users" element={<AdminUsersPage />} />
                <Route path="/admin/users/:userId" element={<AdminUserDetailPage />} />
              </Route>
            </Routes>
          </Suspense>
        </div>
      </ErrorBoundary>
    </BrowserRouter>
  )
}

export default App
