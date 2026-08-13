import { OrderStatus } from './status';

export const AUDIT_TRIGGERS = ['created', 'payment', 'refund', 'observed'] as const;
export type AuditTrigger = (typeof AUDIT_TRIGGERS)[number];

export interface AuditLogEntryResponse {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  trigger: AuditTrigger;
  occurredAt: Date;
}
