import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'

import { ErrorBoundary } from './components/ErrorBoundary'
import { Navbar } from './components/Navbar'
import { SiteFooter } from './components/SiteFooter'
import { CartDrawer } from './components/cart/CartDrawer'
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
import { CustomerProjectDetailPage } from './pages/Dashboard/CustomerProjectDetailPage'
import { CustomerProjectRequestPage } from './pages/Dashboard/CustomerProjectRequestPage'
import { DashboardPage } from './pages/Dashboard/DashboardPage'
import { MyProjectsPage } from './pages/Dashboard/MyProjectsPage'
import { MyOrdersPage } from './pages/Dashboard/MyOrdersPage'
import { MyDownloadsPage } from './pages/Dashboard/MyDownloadsPage'
import { CustomerOrderDetailPage } from './pages/Dashboard/CustomerOrderDetailPage'
import { WishlistPage } from './pages/Dashboard/WishlistPage'
import { CartPage } from './pages/Cart/CartPage'
import { CheckoutSuccessPage } from './pages/Checkout/CheckoutSuccessPage'
import { CheckoutCancelPage } from './pages/Checkout/CheckoutCancelPage'
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
import './styles/products-browse.css'
import './styles/product-details.css'
import './styles/cart.css'
import './styles/marketing.css'

const ProductsBrowsePage = lazy(() =>
  import('./pages/Products/ProductsBrowsePage').then((module) => ({
    default: module.ProductsBrowsePage,
  })),
)

const PluginsBrowsePage = lazy(() =>
  import('./pages/Plugins/PluginsBrowsePage').then((module) => ({
    default: module.PluginsBrowsePage,
  })),
)

const PluginDetailsPage = lazy(() =>
  import('./pages/Plugins/PluginDetailsPage').then((module) => ({
    default: module.PluginDetailsPage,
  })),
)

const ProductDetailsPage = lazy(() =>
  import('./pages/Products/ProductDetailsPage').then((module) => ({
    default: module.ProductDetailsPage,
  })),
)

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
const AdminOrdersPage = lazy(() =>
  import('./pages/Admin/AdminOrdersPage').then((module) => ({
    default: module.AdminOrdersPage,
  })),
)
const AdminOrderDetailPage = lazy(() =>
  import('./pages/Admin/AdminOrderDetailPage').then((module) => ({
    default: module.AdminOrderDetailPage,
  })),
)
const AdminPaymentsPage = lazy(() =>
  import('./pages/Admin/AdminPaymentsPage').then((module) => ({
    default: module.AdminPaymentsPage,
  })),
)
const AdminPaymentDetailPage = lazy(() =>
  import('./pages/Admin/AdminPaymentDetailPage').then((module) => ({
    default: module.AdminPaymentDetailPage,
  })),
)
const AdminReviewsPage = lazy(() =>
  import('./pages/Admin/AdminReviewsPage').then((module) => ({
    default: module.AdminReviewsPage,
  })),
)
const AdminDownloadsPage = lazy(() =>
  import('./pages/Admin/AdminDownloadsPage').then((module) => ({
    default: module.AdminDownloadsPage,
  })),
)
const AdminCouponsPage = lazy(() =>
  import('./pages/Admin/AdminCouponsPage').then((module) => ({
    default: module.AdminCouponsPage,
  })),
)
const AdminCouponDetailPage = lazy(() =>
  import('./pages/Admin/AdminCouponDetailPage').then((module) => ({
    default: module.AdminCouponDetailPage,
  })),
)

const AboutPage = lazy(() =>
  import('./pages/About/AboutPage').then((module) => ({
    default: module.AboutPage,
  })),
)

const ContactPage = lazy(() =>
  import('./pages/Contact/ContactPage').then((module) => ({
    default: module.ContactPage,
  })),
)

const CustomProjectsLandingPage = lazy(() =>
  import('./pages/CustomProjects/CustomProjectsLandingPage').then((module) => ({
    default: module.CustomProjectsLandingPage,
  })),
)

function AppRoutes() {
  const location = useLocation()
  const hideMainNavbar =
    location.pathname.startsWith('/admin') && location.pathname !== '/admin/login'
  const hideSiteFooter =
    location.pathname.startsWith('/admin') && location.pathname !== '/admin/login'

  return (
    <>
      {!hideMainNavbar ? <Navbar /> : null}
      <CartDrawer />
      <div className="app-shell">
        <Suspense fallback={<Spinner fullPage />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/custom-projects" element={<CustomProjectsLandingPage />} />
            <Route path="/products" element={<ProductsBrowsePage />} />
            <Route path="/Products" element={<ProductsBrowsePage />} />
            <Route path="/products/:slug" element={<ProductDetailsPage />} />
            <Route path="/Products/:slug" element={<ProductDetailsPage />} />
            <Route path="/plugins" element={<PluginsBrowsePage />} />
            <Route path="/Plugins" element={<PluginsBrowsePage />} />
            <Route path="/plugins/:slug" element={<PluginDetailsPage />} />
            <Route path="/Plugins/:slug" element={<PluginDetailsPage />} />
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
              <Route path="/dashboard/projects" element={<MyProjectsPage />} />
              <Route path="/dashboard/orders" element={<MyOrdersPage />} />
              <Route path="/dashboard/downloads" element={<MyDownloadsPage />} />
              <Route path="/dashboard/wishlist" element={<WishlistPage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
              <Route path="/checkout/cancel" element={<CheckoutCancelPage />} />
              <Route
                path="/dashboard/projects/new"
                element={<CustomerProjectRequestPage />}
              />
              <Route
                path="/dashboard/projects/:projectId"
                element={<CustomerProjectDetailPage />}
              />
              <Route
                path="/dashboard/orders/:orderId"
                element={<CustomerOrderDetailPage />}
              />
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
              <Route path="/admin/orders" element={<AdminOrdersPage />} />
              <Route
                path="/admin/orders/:orderId"
                element={<AdminOrderDetailPage />}
              />
              <Route path="/admin/payments" element={<AdminPaymentsPage />} />
              <Route
                path="/admin/payments/:paymentId"
                element={<AdminPaymentDetailPage />}
              />
              <Route path="/admin/coupons" element={<AdminCouponsPage />} />
              <Route
                path="/admin/coupons/:couponId"
                element={<AdminCouponDetailPage />}
              />
              <Route path="/admin/reviews" element={<AdminReviewsPage />} />
              <Route path="/admin/downloads" element={<AdminDownloadsPage />} />
              <Route path="/admin/users" element={<AdminUsersPage />} />
              <Route path="/admin/users/:userId" element={<AdminUserDetailPage />} />
            </Route>
          </Routes>
        </Suspense>
      </div>
      {!hideSiteFooter ? <SiteFooter /> : null}
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
