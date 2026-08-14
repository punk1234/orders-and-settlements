'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { OrderForm, OrderFormValues } from '@/components/OrderForm';
import { Skeleton } from '@/components/Skeleton';
import type { Order } from '@/lib/types';

export default function EditOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Order>(`/orders/${id}`)
      .then((res) => {
        if (!res.editable) {
          router.replace(`/orders/${id}`);
          return;
        }
        setOrder(res);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load order.'))
      .finally(() => setLoading(false));
  }, [id, router]);

  async function handleSubmit(values: OrderFormValues) {
    await api.patch(`/orders/${id}`, values);
    toast.success('Order changes saved.');
    router.push(`/orders/${id}`);
  }

  if (loading) return <EditOrderSkeleton />;
  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!order) return null;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Edit order</h1>
      <div className="mt-6 max-w-2xl rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800">
        <OrderForm
          initial={{
            customer: order.customer,
            dueDate: order.dueDate.slice(0, 10),
            lineItems: order.lineItems,
          }}
          onSubmit={handleSubmit}
          submitLabel="Save changes"
        />
      </div>
    </div>
  );
}

// Mirrors the loaded form's shape (title, customer/due-date fields, one
// line-item row) so nothing visually jumps once the order data arrives —
// same skeleton pattern used elsewhere (orders list, order detail).
function EditOrderSkeleton() {
  return (
    <div>
      <Skeleton className="h-7 w-32" />
      <div className="mt-6 max-w-2xl space-y-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="mt-2 h-9 w-full" />
          </div>
          <div>
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="mt-2 h-9 w-full" />
          </div>
        </div>
        <div>
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="mt-2 h-16 w-full rounded-md" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
    </div>
  );
}
