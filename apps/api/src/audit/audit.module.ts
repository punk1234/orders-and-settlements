import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogEntry, AuditLogEntrySchema } from './schemas/audit-log-entry.schema';
import { AuditService } from './audit.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: AuditLogEntry.name, schema: AuditLogEntrySchema }])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
