'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError, API_URL } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Order, OrderStatus } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { SkeletonTableRow } from '@/components/Skeleton';

const STATUS_OPTIONS: { value: OrderStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'partially_paid', label: 'Partially paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
];

const TABLE_SKELETON_WIDTHS = ['w-32', 'w-20', 'w-16 ml-auto', 'w-16 ml-auto', 'w-16 ml-auto', 'w-24'];

type SortKey = 'dueDate' | 'amountDue';
type SortDir = 'asc' | 'desc';

function SortIcon({ direction }: { direction: SortDir | null }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      {direction === 'desc' ? (
        <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
      ) : (
        <path d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832l-3.71 3.938a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" />
      )}
    </svg>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const query = status ? `?status=${status}` : '';
    api
      .get<Order[]>(`/orders${query}`)
      .then((res) => {
        if (!cancelled) setOrders(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load orders.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const visibleOrders = useMemo(() => {
    let result = orders;

    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter((order) => order.customer.toLowerCase().includes(query));
    }

    if (sortKey) {
      result = [...result].sort((a, b) => {
        const aValue = sortKey === 'dueDate' ? new Date(a.dueDate).getTime() : a.amountDue;
        const bValue = sortKey === 'dueDate' ? new Date(b.dueDate).getTime() : b.amountDue;
        return sortDir === 'asc' ? aValue - bValue : bValue - aValue;
      });
    }

    return result;
  }, [orders, search, sortKey, sortDir]);

  function sortableHeaderClass(key: SortKey) {
    return `flex items-center gap-1 ${sortKey === key ? '' : 'opacity-0 group-hover:opacity-60'}`;
  }

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (exportFrom) params.set('from', exportFrom);
    if (exportTo) params.set('to', exportTo);
    const query = params.toString();
    return `${API_URL}/orders/export${query ? `?${query}` : ''}`;
  }, [exportFrom, exportTo]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Orders</h1>
        <Link
          href="/orders/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          New order
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer…"
          aria-label="Search orders by customer"
          className="w-full max-w-xs rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as OrderStatus | '')}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-400"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div>
          <label htmlFor="export-from" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Export from
          </label>
          <input
            id="export-from"
            type="date"
            value={exportFrom}
            onChange={(e) => setExportFrom(e.target.value)}
            className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-400"
          />
        </div>
        <div>
          <label htmlFor="export-to" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            to
          </label>
          <input
            id="export-to"
            type="date"
            value={exportTo}
            onChange={(e) => setExportTo(e.target.value)}
            className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-400"
          />
        </div>
        <a
          href={exportHref}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Download CSV
        </a>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Filters by due date. Leave both blank to export everything.
        </p>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {error ? (
          <p className="p-6 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : !loading && orders.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500 dark:text-zinc-400">No orders yet.</p>
        ) : !loading && visibleOrders.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500 dark:text-zinc-400">
            No orders match &ldquo;{search}&rdquo;.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="group px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('amountDue')}
                    className="ml-auto flex items-center gap-1 uppercase hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    Due
                    <span className={sortableHeaderClass('amountDue')}>
                      <SortIcon direction={sortKey === 'amountDue' ? sortDir : 'asc'} />
                    </span>
                  </button>
                </th>
                <th className="group px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleSort('dueDate')}
                    className="flex items-center gap-1 uppercase hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    Due date
                    <span className={sortableHeaderClass('dueDate')}>
                      <SortIcon direction={sortKey === 'dueDate' ? sortDir : 'asc'} />
                    </span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonTableRow key={i} widths={TABLE_SKELETON_WIDTHS} />
                  ))
                : visibleOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                      onClick={() => router.push(`/orders/${order.id}`)}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-medium text-zinc-900 dark:text-zinc-50"
                        >
                          {order.customer}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-4 py-3 text-right dark:text-zinc-200">
                        {formatCurrency(order.total)}
                      </td>
                      <td className="px-4 py-3 text-right dark:text-zinc-200">
                        {formatCurrency(order.amountPaid)}
                      </td>
                      <td className="px-4 py-3 text-right dark:text-zinc-200">
                        {formatCurrency(order.amountDue)}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {formatDate(order.dueDate)}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
