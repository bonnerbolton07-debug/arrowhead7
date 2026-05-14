/**
 * Lightweight stand-in for DashboardShell that doesn't touch Supabase.
 * Used by route-level loading.tsx files so the route segment can render
 * its skeleton without waiting on auth/profile.
 */
export function SkeletonShell({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-a7-base to-a7-void">
      {/* Sidebar placeholder (desktop only) */}
      <aside
        className="hidden md:flex fixed top-0 left-0 bottom-0 w-64 flex-col"
        style={{
          background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
          borderRight: '1px solid rgba(245,240,232,0.04)',
        }}
        aria-hidden="true"
      >
        <div className="px-5 py-6">
          <div className="h-6 w-28 rounded bg-a7-text/10 animate-pulse" />
        </div>
        <div className="px-3 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-9 rounded-md bg-a7-text/[0.04] animate-pulse"
            />
          ))}
        </div>
      </aside>

      <main className="md:ml-64 pb-20 md:pb-8">
        <header className="px-5 sm:px-8 pt-8 sm:pt-10 pb-4">
          <div className="max-w-6xl">
            <div
              className="h-8 w-48 rounded bg-a7-text/10 animate-pulse"
              aria-label={title ? `${title} loading` : 'Loading'}
            />
            <div className="h-4 w-72 rounded bg-a7-text/[0.06] animate-pulse mt-3" />
          </div>
        </header>

        <div className="px-5 sm:px-8">{children}</div>
      </main>
    </div>
  );
}

export function SkeletonBox({
  className = '',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-md bg-a7-text/[0.06] animate-pulse ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}
