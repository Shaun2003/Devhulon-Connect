function SkeletonBar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-[#e7eef5] ${className}`} />;
}

export function BusinessProfileSkeleton() {
  return (
    <article aria-hidden="true" className="hippo-card flex min-w-0 flex-col gap-3 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <SkeletonBar className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBar className="h-3 w-2/3" />
          <SkeletonBar className="h-5 w-1/2" />
          <SkeletonBar className="h-3 w-20" />
        </div>
      </div>
      <SkeletonBar className="h-4 w-full" />
      <SkeletonBar className="h-4 w-4/5" />
      <div className="flex gap-2">
        <SkeletonBar className="h-6 w-24 rounded-full" />
        <SkeletonBar className="h-6 w-28 rounded-full" />
      </div>
      <SkeletonBar className="h-8 w-4/5" />
      <div className="grid gap-2 sm:grid-cols-3">
        <SkeletonBar className="h-10" />
        <SkeletonBar className="h-10" />
        <SkeletonBar className="h-10" />
      </div>
    </article>
  );
}

export function FeaturedBusinessSkeleton() {
  return (
    <article aria-hidden="true" className="animate-pulse overflow-hidden rounded-2xl border border-[#e7eef5] bg-white shadow-sm">
      <div className="h-32 bg-[#e7eef5]" />
      <div className="space-y-3 p-5">
        <SkeletonBar className="h-5 w-3/5" />
        <SkeletonBar className="h-3 w-1/3" />
        <SkeletonBar className="h-4 w-1/2" />
        <SkeletonBar className="h-4 w-full" />
        <SkeletonBar className="h-4 w-4/5" />
        <div className="grid grid-cols-3 gap-2 border-t border-[#e7eef5] pt-4">
          <SkeletonBar className="h-9" />
          <SkeletonBar className="h-9" />
          <SkeletonBar className="h-9" />
        </div>
      </div>
    </article>
  );
}

export function FeedRowSkeleton() {
  return (
    <li aria-hidden="true" className="hippo-card flex animate-pulse items-center justify-between gap-3 p-3.5">
      <div className="min-w-0 flex-1 space-y-2">
        <SkeletonBar className="h-4 w-3/5" />
        <SkeletonBar className="h-3 w-4/5" />
        <SkeletonBar className="h-3 w-20" />
      </div>
      <SkeletonBar className="h-7 w-16 shrink-0 rounded-full" />
    </li>
  );
}
