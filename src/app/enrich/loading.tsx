export default function Loading() {
  return (
    <div className="flex flex-col gap-8 p-8">
      {/* Header skeleton */}
      <div className="flex flex-col gap-2">
        <div className="h-8 w-52 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded-md bg-muted" />
      </div>

      {/* Filter tabs skeleton */}
      <div className="h-9 w-64 animate-pulse rounded-lg bg-muted" />

      {/* Cards grid skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border bg-card p-6 shadow-sm">
            {/* Card header */}
            <div className="mb-4 flex items-start justify-between gap-2">
              <div className="flex flex-col gap-1.5">
                <div className="h-4 w-36 animate-pulse rounded-md bg-muted" />
                <div className="h-3 w-28 animate-pulse rounded-md bg-muted" />
              </div>
              <div className="h-5 w-20 animate-pulse rounded-lg bg-muted" />
            </div>

            {/* Metrics row */}
            <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex flex-col items-center gap-1">
                  <div className="h-5 w-8 animate-pulse rounded-md bg-muted" />
                  <div className="h-3 w-12 animate-pulse rounded-md bg-muted" />
                </div>
              ))}
            </div>

            {/* Button */}
            <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}
