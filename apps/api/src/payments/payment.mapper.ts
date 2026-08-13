import { PaymentDocument } from './schemas/payment.schema';

export interface PaymentResponse {
  id: string;
  amount: number;
  date: Date;
  note?: string;
  createdAt?: Date;
}

export function toPaymentResponse(payment: PaymentDocument): PaymentResponse {
  return {
    id: payment.id,
    amount: payment.amount,
    date: payment.date,
    note: payment.note,
    createdAt: payment.createdAt,
  };
}
