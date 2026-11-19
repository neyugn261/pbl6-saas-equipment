import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Principal } from '@pbl6/auth';
import type { ReferencesClient } from '../references/references.client';
import type { WorkOrdersRepository } from './work-orders.repository';
import { QuickDispatchDto } from './dto';
import { WorkOrdersService } from './work-orders.service';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const BRANCH_ID = '00000000-0000-4000-8000-000000000002';
const USER_ID = '00000000-0000-4000-8000-000000000003';
const REQUEST_ID = '00000000-0000-4000-8000-000000000010';
const TECH_ID = '00000000-0000-4000-8000-000000000020';
const EQUIPMENT_ID = '00000000-0000-4000-8000-000000000030';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000040';

function createPrincipal(): Principal {
  return {
    userId: USER_ID,
    branchId: BRANCH_ID,
    tenantId: TENANT_ID,
    sessionId: 'session-1',
    userType: 'TENANT_STAFF',
    roles: ['SERVICE_MANAGER'],
    permissions: new Set(['work_order:manage', 'work_order:read']),
    customerId: null,
    accessToken: 'test-token',
    expiresAt: new Date(Date.now() + 60_000),
  };
}

describe('QuickDispatchDto validation', () => {
  it('validates a minimal valid QuickDispatchDto', async () => {
    const dto = plainToInstance(QuickDispatchDto, {
      serviceRequestId: REQUEST_ID,
      technicianId: TECH_ID,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('validates a complete valid QuickDispatchDto', async () => {
    const dto = plainToInstance(QuickDispatchDto, {
      serviceRequestId: REQUEST_ID,
      technicianId: TECH_ID,
      type: 'REPAIR',
      title: 'Fix cooling pump',
      description: 'Cooling pump leaking',
      priority: 'HIGH',
      scheduledStart: '2026-06-01T08:00:00.000Z',
      scheduledEnd: '2026-06-01T12:00:00.000Z',
      dispatchNotes: 'Please bring seal kit A',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects missing serviceRequestId', async () => {
    const dto = plainToInstance(QuickDispatchDto, {
      technicianId: TECH_ID,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'serviceRequestId')).toBe(true);
  });

  it('rejects invalid UUID for serviceRequestId', async () => {
    const dto = plainToInstance(QuickDispatchDto, {
      serviceRequestId: 'invalid-uuid',
      technicianId: TECH_ID,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'serviceRequestId')).toBe(true);
  });

  it('rejects missing technicianId', async () => {
    const dto = plainToInstance(QuickDispatchDto, {
      serviceRequestId: REQUEST_ID,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'technicianId')).toBe(true);
  });

  it('rejects invalid priority', async () => {
    const dto = plainToInstance(QuickDispatchDto, {
      serviceRequestId: REQUEST_ID,
      technicianId: TECH_ID,
      priority: 'SUPER_URGENT',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'priority')).toBe(true);
  });

  it('rejects invalid scheduled dates', async () => {
    const dto = plainToInstance(QuickDispatchDto, {
      serviceRequestId: REQUEST_ID,
      technicianId: TECH_ID,
      scheduledStart: 'not-a-date',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'scheduledStart')).toBe(true);
  });
});

describe('WorkOrdersService.quickDispatch', () => {
  let service: WorkOrdersService;
  let mockRepo: jest.Mocked<Partial<WorkOrdersRepository>>;
  let mockRefs: jest.Mocked<Partial<ReferencesClient>>;

  beforeEach(() => {
    mockRepo = {
      quickDispatch: jest.fn(),
    };
    mockRefs = {
      request: jest.fn(),
      equipment: jest.fn(),
    };
    service = new WorkOrdersService(
      mockRepo as unknown as WorkOrdersRepository,
      mockRefs as unknown as ReferencesClient,
    );
  });

  it('successfully delegates quick dispatch when service request is ACCEPTED', async () => {
    const principal = createPrincipal();
    const mockRequest = {
      id: REQUEST_ID,
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      customerId: CUSTOMER_ID,
      equipmentId: EQUIPMENT_ID,
      type: 'REPAIR',
      priority: 'NORMAL',
      status: 'ACCEPTED',
      title: 'Broken engine',
      description: 'Engine won start',
    };
    const mockEquipment = {
      id: EQUIPMENT_ID,
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      branchId: BRANCH_ID,
      modelName: 'Pump-X',
      serialNumber: 'SN-001',
    };
    const expectedWo = {
      id: 'wo-1',
      workOrderNo: 'WO-2026-0001',
      status: 'ASSIGNED',
    };

    (mockRefs.request as jest.Mock).mockResolvedValue(mockRequest);
    (mockRefs.equipment as jest.Mock).mockResolvedValue(mockEquipment);
    (mockRepo.quickDispatch as jest.Mock).mockImplementation(
      async (_p, _input, resolve) => {
        const resolved = await resolve();
        expect(resolved.source).toEqual(mockRequest);
        expect(resolved.equipment).toEqual(mockEquipment);
        expect(resolved.effectiveType).toBe('REPAIR');
        return expectedWo;
      },
    );

    const input: QuickDispatchDto = {
      serviceRequestId: REQUEST_ID,
      technicianId: TECH_ID,
      dispatchNotes: 'Inspect immediately',
    };

    const result = await service.quickDispatch(principal, input);
    expect(result).toBe(expectedWo);
    expect(mockRepo.quickDispatch).toHaveBeenCalledWith(
      principal,
      input,
      expect.any(Function),
    );
  });

  it('rejects if service request is not found', async () => {
    const principal = createPrincipal();
    (mockRefs.request as jest.Mock).mockResolvedValue(null);

    (mockRepo.quickDispatch as jest.Mock).mockImplementation(
      async (_p, _input, resolve) => {
        return resolve();
      },
    );

    const input: QuickDispatchDto = {
      serviceRequestId: REQUEST_ID,
      technicianId: TECH_ID,
    };

    await expect(service.quickDispatch(principal, input)).rejects.toThrow();
  });

  it('rejects if service request status is not ACCEPTED for REPAIR', async () => {
    const principal = createPrincipal();
    (mockRefs.request as jest.Mock).mockResolvedValue({
      id: REQUEST_ID,
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      customerId: CUSTOMER_ID,
      equipmentId: EQUIPMENT_ID,
      type: 'REPAIR',
      priority: 'NORMAL',
      status: 'NEW', // not ACCEPTED
    });

    (mockRepo.quickDispatch as jest.Mock).mockImplementation(
      async (_p, _input, resolve) => {
        return resolve();
      },
    );

    const input: QuickDispatchDto = {
      serviceRequestId: REQUEST_ID,
      technicianId: TECH_ID,
    };

    await expect(service.quickDispatch(principal, input)).rejects.toThrow();
  });
});
