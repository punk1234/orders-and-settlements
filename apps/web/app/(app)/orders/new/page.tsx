'use client';

import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { OrderForm, OrderFormValues } from '@/components/OrderForm';
import type { Order } from '@/lib/types';

export default function NewOrderPage() {
  const router = useRouter();
  const toast = useToast();

  async function handleSubmit(values: OrderFormValues) {
    const order = await api.post<Order>('/orders', values);
    toast.success(`Order for ${order.customer} created.`);
    router.push(`/orders/${order.id}`);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">New order</h1>
      <div className="mt-6 max-w-2xl rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <OrderForm onSubmit={handleSubmit} submitLabel="Create order" />
      </div>
    </div>
  );
}
