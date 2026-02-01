export default function RootLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div
          className="inline-block w-10 h-10 border-2 border-green-power-500 border-t-transparent rounded-full animate-spin"
          aria-hidden
        />
        <p className="mt-3 text-sm text-gray-600">Loading...</p>
      </div>
    </div>
  );
}
