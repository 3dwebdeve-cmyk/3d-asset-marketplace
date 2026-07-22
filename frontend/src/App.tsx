import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'

import { ErrorBoundary } from './components/ErrorBoundary'
import { Navbar } from './components/Navbar'
import { Spinner } from './components/ui/Spinner'
import { useSessionBootstrap } from './hooks/useSessionBootstrap'
import { AdminCategoriesPage } from './pages/Admin/AdminCategoriesPage'
import { AdminCategoryDetailPage } from './pages/Admin/AdminCategoryDetailPage'
import { AdminDashboardPage } from './pages/Admin/AdminDashboardPage'
import { AdminLoginPage } from './pages/Admin/AdminLoginPage'
import { AdminProductDetailPage } from './pages/Admin/AdminProductDetailPage'
import { AdminProductsPage } from './pages/Admin/AdminProductsPage'
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
import './styles/admin-layout.css'
import './styles/navbar.css'

const AdminPluginsPage = lazy(() =>
  import('./pages/Admin/AdminPluginsPage').then((module) => ({
    default: module.AdminPluginsPage,
  })),
)
const AdminPluginDetailPage = lazy(() =>
  import('./pages/Admin/AdminPluginDetailPage').then((module) => ({
    default: module.AdminPluginDetailPage,
  })),
)
const AdminPluginCategoriesPage = lazy(() =>
  import('./pages/Admin/AdminPluginCategoriesPage').then((module) => ({
    default: module.AdminPluginCategoriesPage,
  })),
)
const AdminPluginCategoryDetailPage = lazy(() =>
  import('./pages/Admin/AdminPluginCategoryDetailPage').then((module) => ({
    default: module.AdminPluginCategoryDetailPage,
  })),
)
const AdminProjectsPage = lazy(() =>
  import('./pages/Admin/AdminProjectsPage').then((module) => ({
    default: module.AdminProjectsPage,
  })),
)
const AdminProjectDetailPage = lazy(() =>
  import('./pages/Admin/AdminProjectDetailPage').then((module) => ({
    default: module.AdminProjectDetailPage,
  })),
)

function AppRoutes() {
  const location = useLocation()
  const hideMainNavbar =
    location.pathname.startsWith('/admin') && location.pathname !== '/admin/login'

  return (
    <>
      {!hideMainNavbar ? <Navbar /> : null}
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
              <Route path="/admin/categories" element={<AdminCategoriesPage />} />
              <Route
                path="/admin/categories/:categoryId"
                element={<AdminCategoryDetailPage />}
              />
              <Route path="/admin/products" element={<AdminProductsPage />} />
              <Route
                path="/admin/products/:productId"
                element={<AdminProductDetailPage />}
              />
              <Route path="/admin/plugins" element={<AdminPluginsPage />} />
              <Route
                path="/admin/plugins/:pluginId"
                element={<AdminPluginDetailPage />}
              />
              <Route
                path="/admin/plugin-categories"
                element={<AdminPluginCategoriesPage />}
              />
              <Route
                path="/admin/plugin-categories/:categoryId"
                element={<AdminPluginCategoryDetailPage />}
              />
              <Route path="/admin/projects" element={<AdminProjectsPage />} />
              <Route
                path="/admin/projects/:projectId"
                element={<AdminProjectDetailPage />}
              />
              <Route path="/admin/users" element={<AdminUsersPage />} />
              <Route path="/admin/users/:userId" element={<AdminUserDetailPage />} />
            </Route>
          </Routes>
        </Suspense>
      </div>
    </>
  )
}

function App() {
  const isReady = useSessionBootstrap()

  if (!isReady) {
    return <Spinner fullPage label="Restoring your session..." />
  }

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
    </BrowserRouter>
  )
}

export default App
