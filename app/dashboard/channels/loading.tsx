import { SkeletonShell, SkeletonBox } from '@/components/dashboard/SkeletonShell';

export default function ChannelsLoading() {
  return (
    <SkeletonShell title="Channels">
      <div className="max-w-6xl">
        {/* Section header */}
        <div className="mb-4">
          <SkeletonBox className="h-5 w-44 mb-2" />
          <SkeletonBox className="h-3 w-64" />
        </div>

        {/* Connected channels grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg p-5"
              style={{
                background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
                border: '1px solid rgba(245,240,232,0.05)',
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <SkeletonBox className="h-10 w-10 rounded-full" />
                <div className="flex-1">
                  <SkeletonBox className="h-4 w-24 mb-2" />
                  <SkeletonBox className="h-3 w-32" />
                </div>
              </div>
              <SkeletonBox className="h-9 w-full" />
            </div>
          ))}
        </div>

        {/* Recent posts section */}
        <SkeletonBox className="h-5 w-36 mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg p-4 flex items-center gap-4"
              style={{
                background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
                border: '1px solid rgba(245,240,232,0.05)',
              }}
            >
              <SkeletonBox className="h-10 w-16" />
              <div className="flex-1 space-y-2">
                <SkeletonBox className="h-4 w-1/2" />
                <SkeletonBox className="h-3 w-1/4" />
              </div>
              <SkeletonBox className="h-6 w-20" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonShell>
  );
}
