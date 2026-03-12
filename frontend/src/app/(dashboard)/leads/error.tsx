'use client';

export default function LeadsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="p-8 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 mb-4">
        <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Something went wrong</h2>
      <p className="text-sm text-gray-500 mb-1">{error.message}</p>
      {error.digest && <p className="text-xs text-gray-400 mb-4">Digest: {error.digest}</p>}
      <pre className="text-xs text-left bg-gray-50 border border-gray-200 rounded-lg p-4 max-w-xl mx-auto mb-4 overflow-auto max-h-40">
        {error.stack}
      </pre>
      <button onClick={reset} className="btn-primary">Try Again</button>
    </div>
  );
}
