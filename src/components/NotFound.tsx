import { Link } from '@tanstack/react-router'
import { Button } from '~/components/win95'

export function NotFound({ children }: { children?: React.ReactNode }) {
  return (
    <div className="space-y-3 p-4">
      <div className="text-disabled-text">
        {children || <p>The page you are looking for does not exist.</p>}
      </div>
      <p className="flex items-center gap-2">
        <Button onClick={() => window.history.back()}>Go Back</Button>
        <Link to="/">
          <Button>Start Over</Button>
        </Link>
      </p>
    </div>
  )
}
