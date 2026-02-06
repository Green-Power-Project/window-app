/** Content-only loader: keeps layout (sidebar + header) visible. */
export default function ProjectLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-transparent">
      <div className="text-center">
        <div className="inline-block h-8 w-8 border-2 border-green-power-200 border-t-green-power-600 rounded-full animate-spin" />
        <p className="mt-3 text-sm text-gray-600">Lädt...</p>
      </div>
    </div>
  );
}
