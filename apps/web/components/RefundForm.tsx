'use client';

import { useState, FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useToast } from '@/lib/toast-context';
import type { Refund } from '@/lib/types';

interface RefundFormProps {
  orderId: string;
  amountPaid: number;
  onRecorded: (refund: Refund) => void;
}

const INPUT_CLASS =
  'mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400';

export function RefundForm({ orderId, amountPaid, onRecorded }: RefundFormProps) {
  const toast = useToast();
  const [amount, setAmount] = useState(String(amountPaid));
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const refund = await api.post<Refund>(`/orders/${orderId}/refunds`, {
        amount: Number(amount),
        date,
        note: note.trim() || undefined,
      });
      onRecorded(refund);
      toast.success(`Refund of ${formatCurrency(refund.amount)} recorded.`);
      setAmount('0');
      setNote('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="refund-amount" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Amount
          </label>
          <input
            id="refund-amount"
            name="amount"
            type="number"
            min={0.01}
            step={0.01}
            max={amountPaid}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-describedby="refund-amount-hint"
            className={INPUT_CLASS}
          />
          <p id="refund-amount-hint" className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Max {formatCurrency(amountPaid)}
          </p>
        </div>
        <div>
          <label htmlFor="refund-date" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Date
          </label>
          <input
            id="refund-date"
            name="date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="refund-note" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Reason (optional)
          </label>
          <input
            id="refund-note"
            name="note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950/40"
      >
        {submitting ? 'Recording…' : 'Record refund'}
      </button>
    </form>
  );
}
