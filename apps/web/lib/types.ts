import type { OrderStatus, AuditTrigger } from '@orders/shared';

export type { OrderStatus, AuditTrigger };

export interface User {
  id: string;
  email: string;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Payment {
  id: string;
  amount: number;
  date: string;
  note?: string;
  createdAt?: string;
}

export interface Refund {
  id: string;
  amount: number;
  date: string;
  note?: string;
  createdAt?: string;
}

export interface AuditLogEntry {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  trigger: AuditTrigger;
  occurredAt: string;
}

export interface Order {
  id: string;
  customer: string;
  dueDate: string;
  lineItems: LineItem[];
  subtotal: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  status: OrderStatus;
  editable: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrderDetail extends Order {
  payments: Payment[];
  refunds: Refund[];
}
