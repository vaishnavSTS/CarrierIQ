import { createBrowserRouter } from 'react-router-dom'

import { RequireAuth } from './components/auth/RequireAuth'
import { AppLayout } from './components/layout/AppLayout'
import { PortalLayout } from './components/layout/PortalLayout'
import { PublicLayout } from './components/layout/PublicLayout'
import { AccountsPage } from './pages/AccountsPage'
import { CarrierProfilePage } from './pages/CarrierProfilePage'
import { DashboardPage } from './pages/DashboardPage'
import { GoogleSignupPage } from './pages/GoogleSignupPage'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PortalHomePage } from './pages/PortalHomePage'
import { RegisterPage } from './pages/RegisterPage'
import { SearchPage } from './pages/SearchPage'

/**
 * Public: landing, login, sign-up.
 * Internal portal (STS staff): dashboard, search, carrier profiles, accounts (STS admins).
 * Client portal (STS clients): /portal, /portal/carriers/:usdot (own verified carriers only).
 */
export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'register/google', element: <GoogleSignupPage /> },
    ],
  },
  {
    element: <RequireAuth portal="internal" />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'search', element: <SearchPage /> },
          { path: 'carriers/:usdot', element: <CarrierProfilePage /> },
          { path: 'accounts', element: <AccountsPage /> },
        ],
      },
    ],
  },
  {
    path: 'portal',
    element: <RequireAuth portal="client" />,
    children: [
      {
        element: <PortalLayout />,
        children: [
          { index: true, element: <PortalHomePage /> },
          { path: 'carriers/:usdot', element: <CarrierProfilePage /> },
        ],
      },
    ],
  },
  {
    element: <PublicLayout />,
    children: [{ path: '*', element: <NotFoundPage /> }],
  },
])
