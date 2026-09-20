import { ErrorComponent, Link, useLocation, useRouter } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { Button } from '~/components/win95'

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter()
  const isRoot = useLocation({
    select: (location) => location.pathname === '/',
  })

  console.error(error)

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 p-4">
      <div className="bevel-sunken max-w-full overflow-auto bg-window p-2">
        <ErrorComponent error={error} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => router.invalidate()}>Try Again</Button>
        {isRoot ? (
          <Link to="/">
            <Button>Home</Button>
          </Link>
        ) : (
          <Link
            to="/"
            onClick={(e) => {
              e.preventDefault()
              window.history.back()
            }}
          >
            <Button>Go Back</Button>
          </Link>
        )}
      </div>
    </div>
  )
}
