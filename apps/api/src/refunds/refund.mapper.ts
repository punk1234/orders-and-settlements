import { RefundDocument } from './schemas/refund.schema';

export interface RefundResponse {
  id: string;
  amount: number;
  date: Date;
  note?: string;
  createdAt?: Date;
}

export function toRefundResponse(refund: RefundDocument): RefundResponse {
  return {
    id: refund.id,
    amount: refund.amount,
    date: refund.date,
    note: refund.note,
    createdAt: refund.createdAt,
  };
}
