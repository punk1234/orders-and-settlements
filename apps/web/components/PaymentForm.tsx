'use client';

import { useState, FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useToast } from '@/lib/toast-context';
import type { Payment } from '@/lib/types';

interface PaymentFormProps {
  orderId: string;
  amountDue: number;
  onRecorded: (payment: Payment) => void;
}

const INPUT_CLASS =
  'mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400';

export function PaymentForm({ orderId, amountDue, onRecorded }: PaymentFormProps) {
  const toast = useToast();
  const [amount, setAmount] = useState(String(amountDue));
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payment = await api.post<Payment>(`/orders/${orderId}/payments`, {
        amount: Number(amount),
        date,
        note: note.trim() || undefined,
      });
      onRecorded(payment);
      toast.success(`Payment of ${formatCurrency(payment.amount)} recorded.`);
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
          <label htmlFor="payment-amount" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Amount
          </label>
          <input
            id="payment-amount"
            name="amount"
            type="number"
            min={0.01}
            step={0.01}
            max={amountDue}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-describedby="payment-amount-hint"
            className={INPUT_CLASS}
          />
          <p id="payment-amount-hint" className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Max {formatCurrency(amountDue)}
          </p>
        </div>
        <div>
          <label htmlFor="payment-date" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Date
          </label>
          <input
            id="payment-date"
            name="date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="payment-note" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Note (optional)
          </label>
          <input
            id="payment-note"
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
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {submitting ? 'Recording…' : 'Record payment'}
      </button>
    </form>
  );
}
