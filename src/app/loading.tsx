export default function Loading() {
  return (
    <div aria-busy="true" role="status">
      <span className="sr-only">Loading page</span>
      <div className="hippo-hero">
        <div className="mx-auto w-full max-w-6xl animate-pulse space-y-4 px-4 py-8 sm:px-6 sm:py-10">
          <div className="h-3 w-28 rounded bg-white/20" />
          <div className="h-9 w-3/4 max-w-xl rounded-lg bg-white/25 sm:h-11" />
          <div className="h-4 w-full max-w-2xl rounded bg-white/15" />
          <div className="h-4 w-2/3 max-w-lg rounded bg-white/15" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl animate-pulse space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="hippo-card min-w-0 space-y-4 p-4 sm:p-5">
              <div className="h-5 w-2/3 rounded bg-[#d6e1ec]" />
              <div className="h-3 w-full rounded bg-[#e7eef5]" />
              <div className="h-3 w-5/6 rounded bg-[#e7eef5]" />
              <div className="h-24 rounded-xl bg-[#f2f6fa]" />
            </div>
          ))}
        </div>
        <div className="hippo-card space-y-4 p-4 sm:p-5">
          <div className="h-5 w-1/2 rounded bg-[#d6e1ec]" />
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-12 rounded-xl bg-[#f2f6fa]" />
          ))}
        </div>
      </div>
    </div>
  );
}
