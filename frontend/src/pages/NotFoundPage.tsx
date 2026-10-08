import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link to="/" className="mt-4 inline-block text-sm text-blue-700 hover:underline">
        Back to dashboard
      </Link>
    </div>
  )
}
