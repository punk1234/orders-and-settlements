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
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<OrderDetail>(`/orders/${id}`),
      api.get<AuditLogEntry[]>(`/orders/${id}/audit-log`),
    ])
      .then(([orderRes, auditRes]) => {
        setOrder(orderRes);
        setAuditLog(auditRes);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load order.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

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
    return [...payments, ...refunds].sort((a, b) => a.date.localeCompare(b.date));
  }, [order]);

  if (loading) return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>;
  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!order) return null;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/orders" className="text-sm text-zinc-500 underline dark:text-zinc-400">
          ← Back to orders
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{order.customer}</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Due {formatDate(order.dueDate)}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={order.status} />
            {order.editable && (
              <Link
                href={`/orders/${order.id}/edit`}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
        <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">Unit price</th>
                <th className="px-4 py-2 text-right">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
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
        <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          {transactions.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500 dark:text-zinc-400">
              No payments or refunds recorded yet.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
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
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{t.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        {order.amountDue > 0 && (
          <section>
            <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Record a payment
            </h2>
            <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <PaymentForm orderId={order.id} amountDue={order.amountDue} onRecorded={load} />
            </div>
          </section>
        )}

        {order.amountPaid > 0 && (
          <section>
            <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Record a refund
            </h2>
            <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <RefundForm orderId={order.id} amountPaid={order.amountPaid} onRecorded={load} />
            </div>
          </section>
        )}
      </div>

      <section>
        <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Status history
        </h2>
        <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          {auditLog.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500 dark:text-zinc-400">No history yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
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
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs tracking-wide text-zinc-500 uppercase dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}
