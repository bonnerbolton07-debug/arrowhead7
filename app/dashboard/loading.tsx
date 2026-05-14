import { SkeletonShell, SkeletonBox } from '@/components/dashboard/SkeletonShell';

export default function DashboardLoading() {
  return (
    <SkeletonShell title="Dashboard">
      <div className="max-w-6xl">
        {/* Quick actions row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg p-5"
              style={{
                background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
                border: '1px solid rgba(245,240,232,0.05)',
              }}
            >
              <SkeletonBox className="h-7 w-7 mb-4" />
              <SkeletonBox className="h-4 w-24 mb-2" />
              <SkeletonBox className="h-3 w-40" />
            </div>
          ))}
        </div>

        {/* Recommended for you */}
        <div className="mb-12">
          <SkeletonBox className="h-5 w-44 mb-4" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SkeletonBox className="h-28" />
            <SkeletonBox className="h-28" />
          </div>
        </div>

        {/* Recent edits header */}
        <div className="flex items-center justify-between mb-4">
          <SkeletonBox className="h-5 w-32" />
          <SkeletonBox className="h-3 w-16" />
        </div>

        {/* Recent edit cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
                border: '1px solid rgba(245,240,232,0.05)',
              }}
            >
              <SkeletonBox className="aspect-video rounded-none" />
              <div className="p-4 space-y-2">
                <SkeletonBox className="h-4 w-3/4" />
                <SkeletonBox className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonShell>
  );
}
