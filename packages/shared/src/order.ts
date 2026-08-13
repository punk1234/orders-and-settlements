import { z } from 'zod';

export const lineItemSchema = z.object({
  description: z.string().trim().min(1, 'Description is required'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  unitPrice: z.number().min(0, 'Unit price must be >= 0'),
});

export type LineItemInput = z.infer<typeof lineItemSchema>;

export const createOrderSchema = z.object({
  customer: z.string().trim().min(1, 'Customer is required'),
  dueDate: z.coerce.date(),
  lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required'),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const updateOrderSchema = createOrderSchema.partial();

export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

export function computeOrderTotals(lineItems: LineItemInput[]) {
  const subtotal = lineItems.reduce(
    (sum, li) => sum + li.quantity * li.unitPrice,
    0,
  );
  // Rounded to avoid floating point drift accumulating across many lines.
  const rounded = Math.round(subtotal * 100) / 100;
  return { subtotal: rounded, total: rounded };
}
