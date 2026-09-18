import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { ErrorBoundary } from './components/ErrorBoundary'
import { Navbar } from './components/Navbar'
import { SiteBenefitsBanner } from './components/SiteBenefitsBanner'
import { SiteFooter } from './components/SiteFooter'
import { CartDrawer } from './components/cart/CartDrawer'
import { AuthModal } from './components/auth/AuthModal'
import { Spinner } from './components/ui/Spinner'
import {
  ADMIN_BASE,
  ADMIN_LOGIN,
  isAdminLoginPath,
  isAdminSpaPath,
  legacyAdminToConsolePath,
} from './config/adminPaths'
import { useSessionBootstrap } from './hooks/useSessionBootstrap'
import { LoginPage } from './pages/Login/LoginPage'
import { RegisterPage } from './pages/Register/RegisterPage'
import { AdminLoginPage } from './pages/Admin/AdminLoginPage'
import { AdminRoute } from './routes/AdminRoute'
import { ProtectedRoute } from './routes/ProtectedRoute'
import './App.css'
import './styles/auth.css'
import './styles/admin-layout.css'
import './styles/navbar.css'
import './styles/home.css'
import './styles/products-browse.css'
import './styles/plugins-browse.css'
import './styles/product-details.css'
import './styles/product-hub-details.css'
import './styles/cart.css'
import './styles/marketing.css'
import './styles/about.css'
import './styles/responsive.css'

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

const ModelsBrowsePage = lazy(() =>
  import('./pages/Models/ModelsBrowsePage').then((module) => ({
    default: module.ModelsBrowsePage,
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

const PasswordResetRequestPage = lazy(() =>
  import('./pages/PasswordReset/PasswordResetRequestPage').then((module) => ({
    default: module.PasswordResetRequestPage,
  })),
)

const PasswordResetConfirmPage = lazy(() =>
  import('./pages/PasswordReset/PasswordResetConfirmPage').then((module) => ({
    default: module.PasswordResetConfirmPage,
  })),
)

const EmailVerificationPage = lazy(() =>
  import('./pages/EmailVerification/EmailVerificationPage').then((module) => ({
    default: module.EmailVerificationPage,
  })),
)

const EmailVerificationResendPage = lazy(() =>
  import('./pages/EmailVerification/EmailVerificationResendPage').then((module) => ({
    default: module.EmailVerificationResendPage,
  })),
)

const DashboardPage = lazy(() =>
  import('./pages/Dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
)

const MyProjectsPage = lazy(() =>
  import('./pages/Dashboard/MyProjectsPage').then((module) => ({
    default: module.MyProjectsPage,
  })),
)

const MyOrdersPage = lazy(() =>
  import('./pages/Dashboard/MyOrdersPage').then((module) => ({
    default: module.MyOrdersPage,
  })),
)

const MyDownloadsPage = lazy(() =>
  import('./pages/Dashboard/MyDownloadsPage').then((module) => ({
    default: module.MyDownloadsPage,
  })),
)

const WishlistPage = lazy(() =>
  import('./pages/Dashboard/WishlistPage').then((module) => ({
    default: module.WishlistPage,
  })),
)

const CartPage = lazy(() =>
  import('./pages/Cart/CartPage').then((module) => ({
    default: module.CartPage,
  })),
)

const CheckoutSuccessPage = lazy(() =>
  import('./pages/Checkout/CheckoutSuccessPage').then((module) => ({
    default: module.CheckoutSuccessPage,
  })),
)

const CheckoutCancelPage = lazy(() =>
  import('./pages/Checkout/CheckoutCancelPage').then((module) => ({
    default: module.CheckoutCancelPage,
  })),
)

const CustomerProjectRequestPage = lazy(() =>
  import('./pages/Dashboard/CustomerProjectRequestPage').then((module) => ({
    default: module.CustomerProjectRequestPage,
  })),
)

const CustomerProjectDetailPage = lazy(() =>
  import('./pages/Dashboard/CustomerProjectDetailPage').then((module) => ({
    default: module.CustomerProjectDetailPage,
  })),
)

const CustomerOrderDetailPage = lazy(() =>
  import('./pages/Dashboard/CustomerOrderDetailPage').then((module) => ({
    default: module.CustomerOrderDetailPage,
  })),
)

const ProfilePage = lazy(() =>
  import('./pages/Profile/ProfilePage').then((module) => ({
    default: module.ProfilePage,
  })),
)

const AdminDashboardPage = lazy(() =>
  import('./pages/Admin/AdminDashboardPage').then((module) => ({
    default: module.AdminDashboardPage,
  })),
)

const AdminCategoriesPage = lazy(() =>
  import('./pages/Admin/AdminCategoriesPage').then((module) => ({
    default: module.AdminCategoriesPage,
  })),
)

const AdminCategoryDetailPage = lazy(() =>
  import('./pages/Admin/AdminCategoryDetailPage').then((module) => ({
    default: module.AdminCategoryDetailPage,
  })),
)

const AdminProductsPage = lazy(() =>
  import('./pages/Admin/AdminProductsPage').then((module) => ({
    default: module.AdminProductsPage,
  })),
)

const AdminProductDetailPage = lazy(() =>
  import('./pages/Admin/AdminProductDetailPage').then((module) => ({
    default: module.AdminProductDetailPage,
  })),
)

const AdminUsersPage = lazy(() =>
  import('./pages/Admin/AdminUsersPage').then((module) => ({
    default: module.AdminUsersPage,
  })),
)

const AdminUserDetailPage = lazy(() =>
  import('./pages/Admin/AdminUserDetailPage').then((module) => ({
    default: module.AdminUserDetailPage,
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
const AdminAnalyticsPage = lazy(() =>
  import('./pages/Admin/AdminAnalyticsPage').then((module) => ({
    default: module.AdminAnalyticsPage,
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
const TermsPage = lazy(() =>
  import('./pages/Legal/LegalDocumentPage').then((module) => ({
    default: module.TermsPage,
  })),
)
const PrivacyPage = lazy(() =>
  import('./pages/Legal/LegalDocumentPage').then((module) => ({
    default: module.PrivacyPage,
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

const HomePage = lazy(() =>
  import('./pages/Home/HomePage').then((module) => ({
    default: module.HomePage,
  })),
)

function LegacyAdminRedirect() {
  const location = useLocation()
  const target =
    legacyAdminToConsolePath(location.pathname, location.search) ?? ADMIN_BASE
  return <Navigate to={target} replace />
}

function AppRoutes() {
  const location = useLocation()
  const hideChrome =
    isAdminSpaPath(location.pathname) && !isAdminLoginPath(location.pathname)

  return (
    <>
      {!hideChrome ? <Navbar /> : null}
      <CartDrawer />
      <AuthModal />
      <div className="app-shell">
        <Suspense fallback={<Spinner fullPage />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/home" element={<ProductsBrowsePage />} />
            <Route path="/Home" element={<Navigate to="/home" replace />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/custom-projects" element={<CustomProjectsLandingPage />} />
            <Route path="/products" element={<Navigate to="/home" replace />} />
            <Route path="/Products" element={<Navigate to="/home" replace />} />
            <Route path="/products/:slug" element={<ProductDetailsPage />} />
            <Route path="/Products/:slug" element={<ProductDetailsPage />} />
            <Route path="/3d-models" element={<ModelsBrowsePage />} />
            <Route path="/3D-models" element={<Navigate to="/3d-models" replace />} />
            <Route path="/plugins" element={<PluginsBrowsePage />} />
            <Route path="/Plugins" element={<Navigate to="/plugins" replace />} />
            <Route path="/plugins/:slug" element={<PluginDetailsPage />} />
            <Route path="/Plugins/:slug" element={<PluginDetailsPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/login" element={<LoginPage />} />
            {/* Vite-only legacy bookmarks; Compose Nginx keeps /admin/ for Django. */}
            <Route path="/admin/*" element={<LegacyAdminRedirect />} />
            <Route path="/admin" element={<LegacyAdminRedirect />} />
            <Route path={ADMIN_LOGIN} element={<AdminLoginPage />} />
            <Route path="/forgot-password" element={<PasswordResetRequestPage />} />
            <Route
              path="/reset-password/:uid/:token"
              element={<PasswordResetConfirmPage />}
            />
            <Route path="/verify-email/resend" element={<EmailVerificationResendPage />} />
            <Route path="/verify-email/:uid/:token" element={<EmailVerificationPage />} />
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
              <Route path={ADMIN_BASE} element={<AdminDashboardPage />} />
              <Route path={`${ADMIN_BASE}/categories`} element={<AdminCategoriesPage />} />
              <Route
                path={`${ADMIN_BASE}/categories/:categoryId`}
                element={<AdminCategoryDetailPage />}
              />
              <Route path={`${ADMIN_BASE}/products`} element={<AdminProductsPage />} />
              <Route
                path={`${ADMIN_BASE}/products/:productId`}
                element={<AdminProductDetailPage />}
              />
              <Route path={`${ADMIN_BASE}/plugins`} element={<AdminPluginsPage />} />
              <Route
                path={`${ADMIN_BASE}/plugins/:pluginId`}
                element={<AdminPluginDetailPage />}
              />
              <Route
                path={`${ADMIN_BASE}/plugin-categories`}
                element={<AdminPluginCategoriesPage />}
              />
              <Route
                path={`${ADMIN_BASE}/plugin-categories/:categoryId`}
                element={<AdminPluginCategoryDetailPage />}
              />
              <Route path={`${ADMIN_BASE}/projects`} element={<AdminProjectsPage />} />
              <Route
                path={`${ADMIN_BASE}/projects/:projectId`}
                element={<AdminProjectDetailPage />}
              />
              <Route path={`${ADMIN_BASE}/orders`} element={<AdminOrdersPage />} />
              <Route
                path={`${ADMIN_BASE}/orders/:orderId`}
                element={<AdminOrderDetailPage />}
              />
              <Route path={`${ADMIN_BASE}/payments`} element={<AdminPaymentsPage />} />
              <Route
                path={`${ADMIN_BASE}/payments/:paymentId`}
                element={<AdminPaymentDetailPage />}
              />
              <Route path={`${ADMIN_BASE}/coupons`} element={<AdminCouponsPage />} />
              <Route
                path={`${ADMIN_BASE}/coupons/:couponId`}
                element={<AdminCouponDetailPage />}
              />
              <Route path={`${ADMIN_BASE}/reviews`} element={<AdminReviewsPage />} />
              <Route path={`${ADMIN_BASE}/downloads`} element={<AdminDownloadsPage />} />
              <Route path={`${ADMIN_BASE}/analytics`} element={<AdminAnalyticsPage />} />
              <Route path={`${ADMIN_BASE}/users`} element={<AdminUsersPage />} />
              <Route path={`${ADMIN_BASE}/users/:userId`} element={<AdminUserDetailPage />} />
            </Route>
          </Routes>
        </Suspense>
      </div>
      {!hideChrome ? (
        <>
          <SiteBenefitsBanner />
          <SiteFooter />
        </>
      ) : null}
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
