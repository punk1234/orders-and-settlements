import { AuditLogEntryResponse } from '@orders/shared';
import { AuditLogEntryDocument } from './schemas/audit-log-entry.schema';

export function toAuditLogEntryResponse(entry: AuditLogEntryDocument): AuditLogEntryResponse {
  return {
    id: entry.id,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    trigger: entry.trigger,
    occurredAt: entry.occurredAt,
  };
}
