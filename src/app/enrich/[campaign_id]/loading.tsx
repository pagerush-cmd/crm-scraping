export default function Loading() {
  return (
    <div className="flex flex-col gap-8 p-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="h-5 w-20 animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-48 animate-pulse rounded-md bg-muted" />
      </div>

      {/* Tabs */}
      <div className="flex flex-col gap-4">
        <div className="h-9 w-56 animate-pulse rounded-lg bg-muted" />

        {/* Table header */}
        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="flex gap-4 border-b px-6 py-3">
            {['w-32', 'w-24', 'w-36', 'w-24', 'w-16', 'w-20', 'w-20', 'w-24'].map(
              (w, i) => (
                <div key={i} className={`h-4 ${w} animate-pulse rounded-md bg-muted`} />
              )
            )}
          </div>

          {/* Table rows */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-4 border-b px-6 py-4 last:border-0">
              {['w-32', 'w-24', 'w-36', 'w-24', 'w-16', 'w-20', 'w-20', 'w-24'].map(
                (w, j) => (
                  <div key={j} className={`h-4 ${w} animate-pulse rounded-md bg-muted`} />
                )
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
