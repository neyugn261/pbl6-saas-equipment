import { NotificationEventsService } from './notification-events.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma, PendingNotificationEvent } from '../generated/prisma/client.js';

describe('HU-02 unallocated recipient policy', () => {
  it('does not announce an inspection completion as a resolved repair', async () => {
    const service = new NotificationEventsService({} as PrismaService);
    const tx = { recipientSnapshot: { findMany: jest.fn().mockResolvedValue([]) } };
    const result = await service['resolveRecipients'](tx as unknown as Prisma.TransactionClient,
      { tenantId: 'tenant' } as PendingNotificationEvent,
      { kind: 'WORK_ORDER_COMPLETED', occurredAt: new Date().toISOString(), workOrderId: 'wo',
        workOrderNo: 'WO-1', serviceRequestId: null, maintenanceTaskId: 'task', customerId: 'customer',
        result: 'RESOLVED', customerSummary: 'Đã khảo sát', workOrderType: 'INSPECTION' }, null);
    expect(result.kind).toBe('READY');
    if (result.kind !== 'READY') throw new Error('Expected ready notification');
    expect(result.rendered.title).toBe('Đã có kết quả khảo sát');
    expect(result.rendered.body).toContain('thẩm định kết quả');
  });
  it.each([null, 'branch', undefined])('selects the correct staff for branch %s', async (branchId) => {
    const service = new NotificationEventsService({} as PrismaService);
    const snapshot = (userId: string, role: string) => ({ userId, tenantId: 'tenant', userType: 'TENANT_STAFF', accountStatus: 'ACTIVE', roleCodes: [role] });
    const tx = { recipientSnapshot: {
      findUnique: jest.fn().mockResolvedValue({ accountStatus: 'DISABLED', tenantId: 'tenant' }),
      findMany: jest.fn().mockResolvedValue([snapshot('admin', 'TENANT_ADMIN'), snapshot('manager', 'SERVICE_MANAGER')]),
    } };
    const result = await service['resolveRecipients'](tx as unknown as Prisma.TransactionClient,
      { tenantId: 'tenant' } as PendingNotificationEvent,
      { kind: 'SERVICE_REQUEST_CREATED', occurredAt: new Date().toISOString(), branchId,
        serviceRequestId: 'sr', requestNo: 'SR-1', requesterId: 'requester', customerId: 'customer', equipmentId: 'equipment', requestType: 'REPAIR', priority: 'NORMAL' }, null);
    expect(result.kind).toBe('READY');
    if (result.kind !== 'READY') throw new Error('Expected ready recipients');
    expect(result.recipients.map((r) => r.userId)).toEqual([branchId === null ? 'admin' : 'manager']);
  });
});
