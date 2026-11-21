import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-navy px-6 text-center">
      <div>
        <p className="font-mono text-sm text-periwinkle">404</p>
        <h1 className="mt-2 text-4xl font-bold text-white">Page not found</h1>
        <p className="mt-3 text-muted">The page you're looking for doesn't exist.</p>
        <Link to="/" className={buttonVariants({ className: 'mt-8' })}>
          Back to home
        </Link>
      </div>
    </main>
  )
}
