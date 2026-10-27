import { createBrowserRouter } from 'react-router-dom'

import { RequireAuth } from './components/auth/RequireAuth'
import { AppLayout } from './components/layout/AppLayout'
import { BrokerLayout } from './components/layout/BrokerLayout'
import { PortalLayout } from './components/layout/PortalLayout'
import { PublicLayout } from './components/layout/PublicLayout'
import { AccountsPage } from './pages/AccountsPage'
import { BrokerGoogleSignupPage } from './pages/BrokerGoogleSignupPage'
import { BrokerHomePage } from './pages/BrokerHomePage'
import { BrokerRegisterPage } from './pages/BrokerRegisterPage'
import { CarrierProfilePage } from './pages/CarrierProfilePage'
import { ComparePage } from './pages/ComparePage'
import { DashboardPage } from './pages/DashboardPage'
import { DataQsCasePage } from './pages/DataQsCasePage'
import { DataQsPage } from './pages/DataQsPage'
import { GoogleSignupPage } from './pages/GoogleSignupPage'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ClientSearchPage } from './pages/ClientSearchPage'
import { PortalDataQsIntakePage } from './pages/PortalDataQsIntakePage'
import { PortalDataQsPage } from './pages/PortalDataQsPage'
import { PortalHomePage } from './pages/PortalHomePage'
import { RegisterPage } from './pages/RegisterPage'
import { SearchPage } from './pages/SearchPage'
import { ServiceRequestsPage } from './pages/ServiceRequestsPage'
import { InvoicePage } from './pages/InvoicePage'
import { InvoicesPage } from './pages/InvoicesPage'

/**
 * Public: landing, login, sign-up (clients at /register, brokers at /broker/register).
 * Internal portal (STS staff): dashboard, search, compare, carrier profiles, DataQs, accounts
 *   (STS admins).
 * Client portal (STS clients): /portal (their own carriers), /portal/dataqs, /portal/search and
 *   /portal/carriers/:usdot (any carrier, while client search is on).
 * DataQs build plan: docs/DataQ.md.
 * Broker portal (freight brokers): /broker (search), /broker/compare (up to 3 side by side),
 *   /broker/carriers/:usdot (any carrier).
 */
export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'register/google', element: <GoogleSignupPage /> },
      { path: 'broker/login', element: <LoginPage audience="broker" /> },
      { path: 'team/login', element: <LoginPage audience="staff" /> },
      { path: 'broker/register', element: <BrokerRegisterPage /> },
      { path: 'broker/register/google', element: <BrokerGoogleSignupPage /> },
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
          { path: 'compare', element: <ComparePage /> },
          { path: 'carriers/:usdot', element: <CarrierProfilePage /> },
          { path: 'dataqs', element: <DataQsPage /> },
          { path: 'dataqs/new', element: <PortalDataQsIntakePage /> },
          { path: 'dataqs/cases/:caseId', element: <DataQsCasePage /> },
          { path: 'accounts', element: <AccountsPage /> },
          { path: 'service-requests', element: <ServiceRequestsPage /> },
          { path: 'invoices', element: <InvoicesPage /> },
          { path: 'invoices/:invoiceId', element: <InvoicePage /> },
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
          { path: 'dataqs', element: <PortalDataQsPage /> },
          { path: 'dataqs/new', element: <PortalDataQsIntakePage /> },
          { path: 'dataqs/cases/:caseId', element: <DataQsCasePage /> },
          { path: 'search', element: <ClientSearchPage /> },
          { path: 'carriers/:usdot', element: <CarrierProfilePage /> },
          { path: 'invoices/:invoiceId', element: <InvoicePage /> },
        ],
      },
    ],
  },
  {
    path: 'broker',
    element: <RequireAuth portal="broker" />,
    children: [
      {
        element: <BrokerLayout />,
        children: [
          { index: true, element: <BrokerHomePage /> },
          { path: 'compare', element: <ComparePage /> },
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
