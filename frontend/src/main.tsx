import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'

import { ApiError } from './api/client'
import { ME_KEY } from './hooks/useAuth'
import './index.css'
import { router } from './router'

const queryClient: QueryClient = new QueryClient({
  // A 401 from any request means the session ended (expired, logged out elsewhere, account
  // disabled): forget the user so the route guard sends them to the login page.
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        queryClient.setQueryData(ME_KEY, null)
      }
    },
  }),
  defaultOptions: {
    queries: {
      // Retrying a 401 or 403 cannot succeed.
      retry: (failures, error) =>
        !(error instanceof ApiError && (error.status === 401 || error.status === 403)) &&
        failures < 1,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
