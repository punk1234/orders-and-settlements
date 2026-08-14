async function getApiHealth() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  try {
    const res = await fetch(`${apiUrl}/health`, { cache: 'no-store' });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : 'unknown error' };
  }
}

export default async function StatusPage() {
  const health = await getApiHealth();

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">System status</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Confirms the frontend can reach the API.
        </p>

        <div className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">API connectivity</p>
          {health.ok ? (
            <pre className="mt-2 whitespace-pre-wrap text-green-700 dark:text-green-400">
              {JSON.stringify(health.data, null, 2)}
            </pre>
          ) : (
            <p className="mt-2 text-red-700 dark:text-red-400">Could not reach API: {health.detail}</p>
          )}
        </div>
      </div>
    </div>
  );
}
