/** Content-only loader: keeps layout (sidebar + header) visible. */
export default function ProjectSegmentLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center bg-transparent">
      <div className="inline-block h-6 w-6 border-2 border-green-power-200 border-t-green-power-600 rounded-full animate-spin" />
    </div>
  );
}
