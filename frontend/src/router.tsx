import { createBrowserRouter } from 'react-router-dom'

import { AppLayout } from './components/layout/AppLayout'
import { CarrierProfilePage } from './pages/CarrierProfilePage'
import { DashboardPage } from './pages/DashboardPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SearchPage } from './pages/SearchPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'carriers/:usdot', element: <CarrierProfilePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
