import { SkeletonShell, SkeletonBox } from '@/components/dashboard/SkeletonShell';

export default function EditsLoading() {
  return (
    <SkeletonShell title="All Edits">
      <div className="max-w-6xl">
        {/* Filter row */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBox key={i} className="h-8 w-20" />
          ))}
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
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
                <SkeletonBox className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonShell>
  );
}
