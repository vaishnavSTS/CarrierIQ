import { createBrowserRouter, Navigate } from 'react-router-dom'

import { RequireAuth } from './components/auth/RequireAuth'
import { AppLayout } from './components/layout/AppLayout'
import { BrokerLayout } from './components/layout/BrokerLayout'
import { PortalLayout } from './components/layout/PortalLayout'
import { PublicLayout } from './components/layout/PublicLayout'
import { AccountLogsPage } from './pages/AccountLogsPage'
import { AccountsPage } from './pages/AccountsPage'
import { BrokerGoogleSignupPage } from './pages/BrokerGoogleSignupPage'
import { BrokerHomePage } from './pages/BrokerHomePage'
import { CarrierMapPage } from './pages/CarrierMapPage'
import { BrokerInvoicesPage } from './pages/BrokerInvoicesPage'
import { BrokerRegisterPage } from './pages/BrokerRegisterPage'
import { CarrierLinkPage } from './pages/CarrierLinkPage'
import { CarrierProfilePage } from './pages/CarrierProfilePage'
import { ComparePage } from './pages/ComparePage'
import { DashboardPage } from './pages/DashboardPage'
import { DataQsCasePage } from './pages/DataQsCasePage'
import { DataQsPage } from './pages/DataQsPage'
import { GoogleSignupPage } from './pages/GoogleSignupPage'
import { AudienceChooserPage } from './pages/AudienceChooserPage'
import { LandingPage } from './pages/LandingPage'
import { ContactPage } from './pages/ContactPage'
import { MethodologyPage } from './pages/MethodologyPage'
import { SourcesPage } from './pages/SourcesPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { InsuranceGoogleSignupPage } from './pages/InsuranceGoogleSignupPage'
import { InsuranceRegisterPage } from './pages/InsuranceRegisterPage'
import { LoginPage } from './pages/LoginPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { VerifyEmailPage } from './pages/VerifyEmailPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PortalTourPage } from './pages/PortalTourPage'
import { ClientSearchPage } from './pages/ClientSearchPage'
import { PortalDataQsIntakePage } from './pages/PortalDataQsIntakePage'
import { PortalDataQsPage } from './pages/PortalDataQsPage'
import { PortalHomePage } from './pages/PortalHomePage'
import { RegisterPage } from './pages/RegisterPage'
import { SearchPage } from './pages/SearchPage'
import { TryCarrierPage } from './pages/TryCarrierPage'
import { TryNowPage } from './pages/TryNowPage'
import { ServiceRequestsPage } from './pages/ServiceRequestsPage'
import { InvoicePage } from './pages/InvoicePage'
import { InvoicesPage } from './pages/InvoicesPage'
import { HighIssPage } from './pages/HighIssPage'
import { MonitoredDotsPage } from './pages/MonitoredDotsPage'

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
      { index: true, element: <AudienceChooserPage /> },
      { path: 'for-carriers', element: <LandingPage audience="carrier" /> },
      { path: 'for-brokers', element: <LandingPage audience="broker" /> },
      { path: 'for-insurance-agents', element: <LandingPage audience="agent" /> },
      { path: 'for-carriers/portal', element: <PortalTourPage audience="carrier" /> },
      { path: 'for-brokers/portal', element: <PortalTourPage audience="broker" /> },
      { path: 'for-insurance-agents/portal', element: <PortalTourPage audience="agent" /> },
      { path: 'contact', element: <ContactPage /> },
      { path: 'methodology', element: <MethodologyPage /> },
      { path: 'sources', element: <SourcesPage /> },
      { path: 'c/:usdot', element: <CarrierLinkPage /> },
      { path: 'try', element: <TryNowPage /> },
      { path: 'try/:usdot', element: <TryCarrierPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'verify-email', element: <VerifyEmailPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'register/google', element: <GoogleSignupPage /> },
      { path: 'broker/login', element: <LoginPage audience="broker" /> },
      { path: 'team/login', element: <LoginPage audience="staff" /> },
      { path: 'broker/register', element: <BrokerRegisterPage /> },
      { path: 'insurance/login', element: <LoginPage audience="insurance" /> },
      { path: 'insurance/register', element: <InsuranceRegisterPage /> },
      { path: 'broker/register/google', element: <BrokerGoogleSignupPage /> },
      { path: 'insurance/register/google', element: <InsuranceGoogleSignupPage /> },
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
          { path: 'account-logs', element: <AccountLogsPage /> },
          { path: 'service-requests', element: <ServiceRequestsPage /> },
          { path: 'invoices', element: <InvoicesPage /> },
          { path: 'high-iss', element: <HighIssPage /> },
          { path: 'monitored', element: <MonitoredDotsPage /> },
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
          // The carrier map is in the broker portal only; old links go home.
          { path: 'map', element: <Navigate to="/portal" replace /> },
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
          { path: 'map', element: <CarrierMapPage /> },
          { path: 'carriers/:usdot', element: <CarrierProfilePage /> },
          { path: 'invoices', element: <BrokerInvoicesPage /> },
          { path: 'invoices/:invoiceId', element: <InvoicePage /> },
        ],
      },
    ],
  },
  {
    element: <PublicLayout />,
    children: [{ path: '*', element: <NotFoundPage /> }],
  },
])
