import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { ErrorBoundary } from './components/ErrorBoundary'
import { ScrollToTop } from './components/ScrollToTop'
import { SiteMotion } from './components/SiteMotion'
import { Navbar } from './components/Navbar'
import { SiteBenefitsBanner } from './components/SiteBenefitsBanner'
import { SiteFooter } from './components/SiteFooter'
import { CartDrawer } from './components/cart/CartDrawer'
import { AuthModal } from './components/auth/AuthModal'
import { Preloader } from './components/ui/Preloader'
import {
  ADMIN_BASE,
  ADMIN_LOGIN,
  isAdminLoginPath,
  isAdminSpaPath,
  legacyAdminToConsolePath,
} from './config/adminPaths'
import { isDashboardChromePath } from './config/dashboardNav'
import { useSessionBootstrap } from './hooks/useSessionBootstrap'
import { useNotFoundChrome, NotFoundChromeProvider } from './hooks/useNotFoundChrome'
import { DashboardLayout } from './layouts/DashboardLayout'
import { LoginPage } from './pages/Login/LoginPage'
import { RegisterPage } from './pages/Register/RegisterPage'
import { AdminRoute } from './routes/AdminRoute'
import { ProtectedRoute } from './routes/ProtectedRoute'
import './styles/auth.css'
import './styles/navbar.css'
import './styles/cart.css'
import './styles/checkout-success.css'
import './styles/responsive.css'
import './styles/marketing.css'
import './styles/motion.css'

const AdminLoginPage = lazy(() =>
  import('./pages/Admin/AdminLoginPage').then((module) => ({
    default: module.AdminLoginPage,
  })),
)

const ProductsBrowsePage = lazy(() =>
  import('./pages/Products/ProductsBrowsePage').then((module) => ({
    default: module.ProductsBrowsePage,
  })),
)

const AllCategoriesPage = lazy(() =>
  import('./pages/Categories/AllCategoriesPage').then((module) => ({
    default: module.AllCategoriesPage,
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

const DashboardHomePage = lazy(() =>
  import('./pages/Dashboard/DashboardHomePage').then((module) => ({
    default: module.DashboardHomePage,
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

const AdminSecurityPage = lazy(() =>
  import('./pages/Admin/AdminSecurityPage').then((module) => ({
    default: module.AdminSecurityPage,
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

const NotFoundPage = lazy(() =>
  import('./pages/NotFound/NotFoundPage').then((module) => ({
    default: module.NotFoundPage,
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
  const { isNotFound } = useNotFoundChrome()
  const isAdminConsole =
    isAdminSpaPath(location.pathname) && !isAdminLoginPath(location.pathname)
  // Every customer/marketplace page keeps the site Navbar (including dashboard).
  // 404 is a standalone full-viewport screen with no site chrome.
  const hideNavbar = isAdminConsole || isNotFound
  // SiteFooter + benefits banner on all customer-facing pages (admin console keeps
  // its own layout without marketing chrome).
  const hideBenefitsBanner = isAdminConsole || isNotFound
  const hideSiteFooter = isAdminConsole || isNotFound
  const isDashboardChrome = isDashboardChromePath(location.pathname) && !isNotFound

  return (
    <>
      <ScrollToTop />
      <SiteMotion />
      {!hideNavbar ? <Navbar /> : null}
      {!isNotFound ? <CartDrawer /> : null}
      {!isNotFound ? <AuthModal /> : null}
      <div className={`app-shell${isDashboardChrome ? ' app-shell--dashboard' : ''}`}>
        <Suspense fallback={<Preloader />}>
          <Routes>
            <Route path="/" element={<ProductsBrowsePage />} />
            <Route path="/categories" element={<AllCategoriesPage />} />
            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="/Home" element={<Navigate to="/" replace />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/custom-projects" element={<CustomProjectsLandingPage />} />
            <Route path="/products" element={<Navigate to="/" replace />} />
            <Route path="/Products" element={<Navigate to="/" replace />} />
            <Route path="/products/:slug" element={<ProductDetailsPage />} />
            <Route path="/Products/:slug" element={<ProductDetailsPage />} />
            <Route path="/3d-models" element={<ModelsBrowsePage />} />
            <Route path="/3d-models/:categorySlug" element={<ModelsBrowsePage />} />
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
              <Route element={<DashboardLayout />}>
                <Route path="/dashboard" element={<DashboardHomePage />} />
                <Route path="/dashboard/orders" element={<MyOrdersPage />} />
                <Route path="/dashboard/downloads" element={<MyDownloadsPage />} />
                <Route path="/dashboard/wishlist" element={<WishlistPage />} />
                <Route
                  path="/dashboard/password"
                  element={<Navigate to="/profile" replace />}
                />
                <Route
                  path="/dashboard/orders/:orderId"
                  element={<CustomerOrderDetailPage />}
                />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>
              <Route path="/cart" element={<CartPage />} />
              <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
              <Route path="/checkout/cancel" element={<CheckoutCancelPage />} />
            </Route>
            <Route element={<AdminRoute />}>
              <Route path={ADMIN_BASE} element={<AdminDashboardPage />} />
              <Route path={`${ADMIN_BASE}/categories`} element={<AdminCategoriesPage />} />
              <Route
                path={`${ADMIN_BASE}/categories/:categoryId`}
                element={<AdminCategoryDetailPage />}
              />
              <Route path={`${ADMIN_BASE}/products`} element={<AdminProductsPage key="products" />} />
              <Route path={`${ADMIN_BASE}/archived`} element={<AdminProductsPage key="archived" archived />} />
              <Route path={`${ADMIN_BASE}/archived/:productId`} element={<AdminProductDetailPage />} />
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
              <Route path={`${ADMIN_BASE}/reviews`} element={<AdminReviewsPage />} />
              <Route path={`${ADMIN_BASE}/downloads`} element={<AdminDownloadsPage />} />
              <Route path={`${ADMIN_BASE}/analytics`} element={<AdminAnalyticsPage />} />
              <Route path={`${ADMIN_BASE}/users`} element={<AdminUsersPage />} />
              <Route path={`${ADMIN_BASE}/users/:userId`} element={<AdminUserDetailPage />} />
              <Route path={`${ADMIN_BASE}/security`} element={<AdminSecurityPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </div>
      {!hideBenefitsBanner ? <SiteBenefitsBanner /> : null}
      {!hideSiteFooter ? <SiteFooter /> : null}
    </>
  )
}

function App() {
  const isReady = useSessionBootstrap()

  if (!isReady) {
    return <Preloader label="Restoring your session..." />
  }

  return (
    <BrowserRouter>
      <NotFoundChromeProvider>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </NotFoundChromeProvider>
    </BrowserRouter>
  )
}

export default App
