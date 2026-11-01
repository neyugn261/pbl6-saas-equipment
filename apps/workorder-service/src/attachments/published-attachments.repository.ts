import { Injectable } from '@nestjs/common';
import { dataScope, type Principal } from '@pbl6/auth';
import { toPage, type PaginationQueryDto } from '@pbl6/service-kit';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { isTechnicianOnly } from '../work-orders/work-orders.repository';
import { missing } from '../common/errors';
import { forbidden, MAX_ATTACHMENT_BYTES } from './attachment.policy';

export interface PublishedAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}
interface PublishedDownload extends PublishedAttachment {
  storageKey: string;
}
const metadata = (row: PublishedAttachment): PublishedAttachment => ({
  id: row.id,
  fileName: row.fileName,
  mimeType: row.mimeType,
  sizeBytes: row.sizeBytes,
  createdAt: row.createdAt,
});

@Injectable()
export class PublishedAttachmentsRepository {
  constructor(private readonly db: PrismaService) {}

  private orderScope(p: Principal, serviceRequestId: string) {
    const scope = dataScope(p);
    if (p.userType === 'TENANT_STAFF' && !p.permissions.has('work_order:read'))
      throw forbidden();
    const conditions = [
      Prisma.sql`w.tenant_id = ${scope.tenantId}::uuid`,
      Prisma.sql`w.service_request_id = ${serviceRequestId}::uuid`,
      Prisma.sql`w.maintenance_task_id IS NULL`,
    ];
    if (scope.customerId !== null)
      conditions.push(Prisma.sql`w.customer_id = ${scope.customerId}::uuid`);
    if (p.userType === 'TENANT_STAFF' && isTechnicianOnly(p))
      conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM work_order_assignments a
      JOIN technicians t ON t.tenant_id = a.tenant_id AND t.id = a.technician_id
      WHERE a.tenant_id = w.tenant_id AND a.work_order_id = w.id AND t.user_id = ${p.userId}::uuid
    )`);
    return Prisma.join(conditions, ' AND ');
  }

  private published(scope: Prisma.Sql) {
    const visible = Prisma.sql`a.visibility = 'CUSTOMER' AND a.deleted_at IS NULL
      AND a.verified_at IS NOT NULL AND a.checksum_sha256 IS NOT NULL
      AND a.size_bytes BETWEEN 1 AND ${MAX_ATTACHMENT_BYTES}
      AND a.mime_type IN ('image/jpeg', 'image/png', 'application/pdf')`;
    const columns = Prisma.sql`a.id, a.file_name AS "fileName", a.mime_type AS "mimeType",
      a.size_bytes AS "sizeBytes", a.created_at AS "createdAt", a.storage_key AS "storageKey"`;
    return Prisma.sql`WITH scoped_orders AS (
      SELECT w.tenant_id, w.id FROM work_orders w WHERE ${scope}
    ), published AS (
      SELECT ${columns} FROM work_order_attachments a
      JOIN scoped_orders w ON w.tenant_id = a.tenant_id AND w.id = a.work_order_id
      WHERE ${visible}
      UNION ALL
      SELECT ${columns} FROM report_attachments a
      JOIN service_reports r ON r.tenant_id = a.tenant_id AND r.id = a.service_report_id
      JOIN scoped_orders w ON w.tenant_id = r.tenant_id AND w.id = r.work_order_id
      WHERE ${visible}
    )`;
  }

  list(p: Principal, serviceRequestId: string, query: PaginationQueryDto) {
    const scope = this.orderScope(p, serviceRequestId);
    return this.db.$transaction(
      async (tx) => {
        // No matching local WO is source 404, never a guess about SR ownership.
        const orders = await tx.$queryRaw<
          { id: string }[]
        >`SELECT w.id FROM work_orders w WHERE ${scope} LIMIT 1`;
        if (!orders.length) throw missing('WORK_ORDER_NOT_FOUND');
        const source = this.published(scope);
        const [count] = await tx.$queryRaw<
          { total: bigint }[]
        >`${source} SELECT count(*) AS total FROM published`;
        const rows = await tx.$queryRaw<PublishedAttachment[]>`${source}
        SELECT id, "fileName", "mimeType", "sizeBytes", "createdAt" FROM published
        ORDER BY "createdAt" ASC, id ASC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;
        return toPage(rows.map(metadata), Number(count.total), query);
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async download(p: Principal, serviceRequestId: string, attachmentId: string) {
    const source = this.published(this.orderScope(p, serviceRequestId));
    const rows = await this.db.$queryRaw<PublishedDownload[]>`${source}
      SELECT id, "fileName", "mimeType", "sizeBytes", "createdAt", "storageKey"
      FROM published WHERE id = ${attachmentId}::uuid LIMIT 2`;
    // Same UUID in the two old tables is ambiguous: fail closed, never choose
    // an arbitrary parent. Normal API uploads generate independent random IDs.
    if (rows.length !== 1) throw missing('ATTACHMENT_NOT_FOUND');
    return rows[0];
  }
}
