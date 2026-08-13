'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';
import type { Order } from '@/lib/types';

interface AssistantResult {
  answer: string;
  orders: Order[];
}

export function AssistantWidget() {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const res = await api.post<AssistantResult>('/assistant/query', { question: question.trim() });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Ask about your orders</p>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        e.g. &ldquo;which orders are overdue?&rdquo; or &ldquo;what&apos;s my total amount due?&rdquo;
      </p>

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question…"
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {loading ? 'Asking…' : 'Ask'}
        </button>
      </form>

      {error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
          {error.includes('not configured') && (
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
              This is the optional stretch feature — it needs an ANTHROPIC_API_KEY set on the API.
            </span>
          )}
        </p>
      )}

      {result && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-zinc-800 dark:text-zinc-200">{result.answer}</p>
          {result.orders.length > 0 && (
            <div className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 uppercase text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {result.orders.map((order) => (
                    <tr key={order.id} className="dark:text-zinc-200">
                      <td className="px-3 py-2">
                        <Link href={`/orders/${order.id}`} className="underline">
                          {order.customer}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-3 py-2 text-right">{formatCurrency(order.amountDue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
