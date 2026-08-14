'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Order } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { AssistantWidget } from '@/components/AssistantWidget';
import { Skeleton, SkeletonTableRow } from '@/components/Skeleton';

const RECENT_TABLE_SKELETON_WIDTHS = ['w-32', 'w-20', 'w-16 ml-auto', 'w-24'];

const RECENT_ORDERS_LIMIT = 5;

export default function DashboardPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Order[]>('/orders')
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
  }, []);

  const stats = useMemo(() => {
    const totalOutstanding = orders.reduce((sum, o) => sum + o.amountDue, 0);
    const overdueCount = orders.filter((o) => o.status === 'overdue').length;
    const paidCount = orders.filter((o) => o.status === 'paid').length;
    return { totalOrders: orders.length, totalOutstanding, overdueCount, paidCount };
  }, [orders]);

  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .slice(0, RECENT_ORDERS_LIMIT);
  }, [orders]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Dashboard</h1>
        <Link
          href="/orders/new"
          className="w-full rounded-md bg-zinc-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-zinc-800 sm:w-auto dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          New order
        </Link>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard label="Total orders" value={String(stats.totalOrders)} />
            <StatCard label="Total outstanding" value={formatCurrency(stats.totalOutstanding)} />
            <StatCard
              label="Overdue"
              value={String(stats.overdueCount)}
              tone={stats.overdueCount > 0 ? 'warning' : 'default'}
            />
            <StatCard label="Paid in full" value={String(stats.paidCount)} />
          </>
        )}
      </div>

      <AssistantWidget />

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Recent orders
          </h2>
          <Link href="/orders" className="text-sm font-medium text-zinc-900 underline dark:text-zinc-50">
            View all
          </Link>
        </div>

        <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
          {!loading && recentOrders.length === 0 ? (
            <p className="p-6 text-sm text-zinc-500 dark:text-zinc-400">
              No orders yet.{' '}
              <Link href="/orders/new" className="underline">
                Create your first one
              </Link>
              .
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Due</th>
                  <th className="px-4 py-3">Due date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700">
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <SkeletonTableRow key={i} widths={RECENT_TABLE_SKELETON_WIDTHS} />
                    ))
                  : recentOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                    onClick={() => router.push(`/orders/${order.id}`)}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/orders/${order.id}`} className="font-medium text-zinc-900 dark:text-zinc-50">
                        {order.customer}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status} />
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
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning';
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
      <p className="text-xs tracking-wide text-zinc-500 uppercase dark:text-zinc-400">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold ${
          tone === 'warning'
            ? 'text-red-600 dark:text-red-400'
            : 'text-zinc-900 dark:text-zinc-50'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-2 h-6 w-14" />
    </div>
  );
}
