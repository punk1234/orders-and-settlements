'use client';

import { useState, FormEvent } from 'react';
import { formatCurrency } from '@/lib/format';
import { ApiError } from '@/lib/api';
import type { LineItem } from '@/lib/types';

export interface OrderFormValues {
  customer: string;
  dueDate: string;
  lineItems: LineItem[];
}

// Quantity/unit price are edited as raw strings (like PaymentForm's amount
// field) rather than bound directly to a number. Binding `value=` straight
// to a number and re-parsing on every keystroke is what caused the
// "leading zero" bug (typing "3" into a field showing "0" produced "03",
// and re-rendering with the numerically-correct value didn't reliably fix
// the displayed text) — it also silently strips in-progress decimals like
// "1." back to "1" on every keystroke. Keeping the raw text as the source
// of truth avoids both.
interface LineItemDraft {
  description: string;
  quantity: string;
  unitPrice: string;
}

const EMPTY_DRAFT: LineItemDraft = { description: '', quantity: '1', unitPrice: '0' };

// Strips a leading zero that's immediately followed by another digit (e.g.
// "03" -> "3", "007" -> "7"), but leaves "0", "0.5", "1." etc. untouched so
// an explicit zero and in-progress decimals still work normally.
function stripLeadingZero(raw: string): string {
  return raw.replace(/^0+(\d)/, '$1');
}

function toNumber(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function draftToLineItem(draft: LineItemDraft): LineItem {
  return {
    description: draft.description,
    quantity: toNumber(draft.quantity),
    unitPrice: toNumber(draft.unitPrice),
  };
}

interface OrderFormProps {
  initial?: OrderFormValues;
  onSubmit: (values: OrderFormValues) => Promise<void>;
  submitLabel: string;
}

const INPUT_CLASS =
  'mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400';
const CELL_INPUT_CLASS =
  'w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400';

export function OrderForm({ initial, onSubmit, submitLabel }: OrderFormProps) {
  const [customer, setCustomer] = useState(initial?.customer ?? '');
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  const [lineItems, setLineItems] = useState<LineItemDraft[]>(
    initial?.lineItems && initial.lineItems.length > 0
      ? initial.lineItems.map((li) => ({
          description: li.description,
          quantity: String(li.quantity),
          unitPrice: String(li.unitPrice),
        }))
      : [{ ...EMPTY_DRAFT }],
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const subtotal = lineItems.reduce(
    (sum, li) => sum + toNumber(li.quantity) * toNumber(li.unitPrice),
    0,
  );

  function updateLineItem(index: number, patch: Partial<LineItemDraft>) {
    setLineItems((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addLineItem() {
    setLineItems((items) => [...items, { ...EMPTY_DRAFT }]);
  }

  function removeLineItem(index: number) {
    setLineItems((items) => (items.length > 1 ? items.filter((_, i) => i !== index) : items));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!customer.trim() || !dueDate || lineItems.some((li) => !li.description.trim())) {
      setError('Please fill in the customer, due date, and every line item description.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        customer: customer.trim(),
        dueDate,
        lineItems: lineItems.map(draftToLineItem),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="customer" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Customer
          </label>
          <input
            id="customer"
            name="customer"
            type="text"
            required
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="dueDate" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Due date
          </label>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            required
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Line items</label>
          <button
            type="button"
            onClick={addLineItem}
            className="text-sm font-medium text-zinc-900 underline dark:text-zinc-50"
          >
            + Add line item
          </button>
        </div>

        <div className="mt-2 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Description</th>
                <th className="w-24 px-3 py-2">Qty</th>
                <th className="w-32 px-3 py-2">Unit price</th>
                <th className="w-28 px-3 py-2 text-right">Line total</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {lineItems.map((item, index) => (
                <tr key={index}>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      required
                      aria-label={`Line item ${index + 1} description`}
                      value={item.description}
                      onChange={(e) => updateLineItem(index, { description: e.target.value })}
                      className={CELL_INPUT_CLASS}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      required
                      aria-label={`Line item ${index + 1} quantity`}
                      value={item.quantity}
                      onChange={(e) =>
                        updateLineItem(index, { quantity: stripLeadingZero(e.target.value) })
                      }
                      className={CELL_INPUT_CLASS}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      required
                      aria-label={`Line item ${index + 1} unit price`}
                      value={item.unitPrice}
                      onChange={(e) =>
                        updateLineItem(index, { unitPrice: stripLeadingZero(e.target.value) })
                      }
                      className={CELL_INPUT_CLASS}
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-400">
                    {formatCurrency(toNumber(item.quantity) * toNumber(item.unitPrice))}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {lineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLineItem(index)}
                        className="text-zinc-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400"
                        aria-label="Remove line item"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-2 flex justify-end text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Total: {formatCurrency(subtotal)}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
