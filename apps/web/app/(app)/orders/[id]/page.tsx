'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { useToast } from '@/lib/toast-context';
import type { AuditLogEntry, OrderDetail, Payment, Refund } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { PaymentForm } from '@/components/PaymentForm';
import { RefundForm } from '@/components/RefundForm';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Skeleton, SkeletonTableRow } from '@/components/Skeleton';

type Transaction =
  | ({ kind: 'payment' } & Payment)
  | ({ kind: 'refund' } & Refund);

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Split from `refreshing` so recording a payment/refund doesn't unmount
  // the whole page back to a bare loading state — only the very first
  // fetch blocks rendering; later refetches (after a payment/refund is
  // recorded) update in place while a small "Refreshing…" hint shows.
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const load = useCallback(
    (opts: { silent?: boolean } = {}) => {
      if (opts.silent) {
        setRefreshing(true);
      } else {
        setInitialLoading(true);
        setError(null);
      }
      Promise.all([
        api.get<OrderDetail>(`/orders/${id}`),
        api.get<AuditLogEntry[]>(`/orders/${id}/audit-log`),
      ])
        .then(([orderRes, auditRes]) => {
          setOrder(orderRes);
          setAuditLog(auditRes);
        })
        .catch((err) => {
          const message = err instanceof ApiError ? err.message : 'Failed to load order.';
          if (opts.silent) {
            toast.error(message);
          } else {
            setError(message);
          }
        })
        .finally(() => {
          if (opts.silent) setRefreshing(false);
          else setInitialLoading(false);
        });
    },
    [id, toast],
  );

  useEffect(() => {
    load();
    // Only re-run for a genuinely new order id — `load` is intentionally
    // excluded here even though it's in scope, since re-running on every
    // toast-identity change would refetch on unrelated toast activity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const refetchSilently = useCallback(() => load({ silent: true }), [load]);

  async function handleDelete() {
    if (!order) return;

    setDeleting(true);
    try {
      await api.delete(`/orders/${order.id}`);
      toast.success(`Order for ${order.customer} deleted.`);
      router.push('/orders');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete order.');
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  const transactions = useMemo<Transaction[]>(() => {
    if (!order) return [];
    const payments: Transaction[] = order.payments.map((p) => ({ kind: 'payment', ...p }));
    const refunds: Transaction[] = order.refunds.map((r) => ({ kind: 'refund', ...r }));
    // Newest first — a transaction ledger reads better with the most recent
    // activity at the top (bank/Stripe convention), unlike the status-history
    // timeline below, which reads as a story and stays oldest-first.
    return [...payments, ...refunds].sort((a, b) => {
      const byDate = b.date.localeCompare(a.date);
      if (byDate !== 0) return byDate;
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    });
  }, [order]);

  if (initialLoading) return <OrderDetailSkeleton />;
  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!order) return null;

  const showPaymentForm = order.amountDue > 0;
  const showRefundForm = order.amountPaid > 0;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/orders" className="text-sm text-zinc-500 underline dark:text-zinc-400">
          ← Back to orders
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{order.customer}</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Due {formatDate(order.dueDate)}
              {refreshing && (
                <span className="ml-2 text-zinc-400 dark:text-zinc-500" aria-live="polite">
                  Refreshing…
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={order.status} />
            {order.editable && (
              <Link
                href={`/orders/${order.id}/edit`}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Edit
              </Link>
            )}
            {order.editable && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this order?"
        description={`This permanently removes the order for ${order.customer} and can't be undone.`}
        confirmLabel="Delete order"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryStat label="Order total" value={formatCurrency(order.total)} />
        <SummaryStat label="Amount paid" value={formatCurrency(order.amountPaid)} />
        <SummaryStat label="Amount due" value={formatCurrency(order.amountDue)} />
        <SummaryStat label="Line items" value={String(order.lineItems.length)} />
      </div>

      <section>
        <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Line items
        </h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
              <tr>
                <th scope="col" className="px-4 py-2">Description</th>
                <th scope="col" className="px-4 py-2 text-right">Qty</th>
                <th scope="col" className="px-4 py-2 text-right">Unit price</th>
                <th scope="col" className="px-4 py-2 text-right">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700">
              {order.lineItems.map((li, i) => (
                <tr key={i} className="dark:text-zinc-200">
                  <td className="px-4 py-2">{li.description}</td>
                  <td className="px-4 py-2 text-right">{li.quantity}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(li.unitPrice)}</td>
                  <td className="px-4 py-2 text-right">
                    {formatCurrency(li.quantity * li.unitPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Transaction history
        </h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
          {transactions.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500 dark:text-zinc-400">
              No payments or refunds recorded yet.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
                <tr>
                  <th scope="col" className="px-4 py-2">Date</th>
                  <th scope="col" className="px-4 py-2">Type</th>
                  <th scope="col" className="px-4 py-2 text-right">Amount</th>
                  <th scope="col" className="px-4 py-2">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700">
                {transactions.map((t) => (
                  <tr key={`${t.kind}-${t.id}`} className="dark:text-zinc-200">
                    <td className="px-4 py-2">{formatDate(t.date)}</td>
                    <td className="px-4 py-2">
                      {t.kind === 'payment' ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-500/15 dark:text-green-300">
                          Payment
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-500/15 dark:text-red-300">
                          Refund
                        </span>
                      )}
                    </td>
                    <td
                      className={`px-4 py-2 text-right ${
                        t.kind === 'refund' ? 'text-red-600 dark:text-red-400' : ''
                      }`}
                    >
                      {t.kind === 'refund' ? '−' : ''}
                      {formatCurrency(t.amount)}
                    </td>
                    <td
                      className="max-w-[16rem] truncate px-4 py-2 text-zinc-600 dark:text-zinc-400"
                      title={t.note ?? undefined}
                    >
                      {t.note ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {(showPaymentForm || showRefundForm) && (
        <div
          className={`grid grid-cols-1 gap-8 ${showPaymentForm && showRefundForm ? 'sm:grid-cols-2' : ''}`}
        >
          {showPaymentForm && (
            <section>
              <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                Record a payment
              </h2>
              <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
                <PaymentForm orderId={order.id} amountDue={order.amountDue} onRecorded={refetchSilently} />
              </div>
            </section>
          )}

          {showRefundForm && (
            <section>
              <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                Record a refund
              </h2>
              <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
                <RefundForm orderId={order.id} amountPaid={order.amountPaid} onRecorded={refetchSilently} />
              </div>
            </section>
          )}
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Status history
        </h2>
        <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
          {auditLog.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500 dark:text-zinc-400">No history yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-700">
              {auditLog.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    {entry.fromStatus && <StatusBadge status={entry.fromStatus} />}
                    {entry.fromStatus && <span className="text-zinc-400">→</span>}
                    <StatusBadge status={entry.toStatus} />
                  </div>
                  <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
                    <div>{formatDateTime(entry.occurredAt)}</div>
                    <div className="capitalize">{entry.trigger}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
      <p className="text-xs tracking-wide text-zinc-500 uppercase dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}

// Mirrors the loaded page's structure (header, stat cards, line-item table)
// so nothing visually jumps once real content arrives — same skeleton
// pattern already used on the orders list page.
function OrderDetailSkeleton() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-4 w-28" />
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-7 w-20 rounded-full" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-5 w-16" />
          </div>
        ))}
      </div>

      <div>
        <Skeleton className="h-4 w-24" />
        <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonTableRow key={i} widths={['w-40', 'w-10 ml-auto', 'w-16 ml-auto', 'w-16 ml-auto']} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
