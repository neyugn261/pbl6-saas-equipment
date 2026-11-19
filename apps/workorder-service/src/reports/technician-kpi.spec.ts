import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { Principal } from '@pbl6/auth';
import type { DisplayNameLookup } from '@pbl6/service-kit';
import {
  TechnicianDrilldownQueryDto,
  TechnicianKpiQueryDto,
} from './dto';
import type {
  RawTechnicianKpiRow,
  RawTechnicianWorkOrderRow,
  ReportsRepository,
} from './reports.repository';
import { ReportsService } from './reports.service';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const BRANCH_ID = '00000000-0000-4000-8000-000000000002';
const USER_ID = '00000000-0000-4000-8000-000000000003';
const TECH_ID = '00000000-0000-4000-8000-000000000010';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000020';

function createPrincipal(branchId: string | null = BRANCH_ID): Principal {
  return {
    userId: USER_ID,
    branchId,
    tenantId: TENANT_ID,
    sessionId: 'session-1',
    userType: 'TENANT_STAFF',
    roles: ['SERVICE_MANAGER'],
    permissions: new Set(['report:read', 'work_order:read']),
    customerId: null,
    accessToken: 'test-token',
    expiresAt: new Date(Date.now() + 60_000),
  };
}

describe('TechnicianDrilldownQueryDto validation', () => {
  it('accepts valid ISO8601 timestamps', () => {
    const dto = plainToInstance(TechnicianDrilldownQueryDto, {
      from: '2026-11-01T00:00:00+07:00',
      to: '2026-11-30T23:59:59+07:00',
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects invalid timestamps', () => {
    const dto = plainToInstance(TechnicianDrilldownQueryDto, {
      from: 'invalid-date',
      to: '2026-11-30T23:59:59+07:00',
    });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});

describe('ReportsService.technicianKpi enhancements', () => {
  let service: ReportsService;
  let mockRepo: jest.Mocked<Partial<ReportsRepository>>;
  let mockNames: jest.Mocked<Partial<DisplayNameLookup>>;

  beforeEach(() => {
    mockRepo = {
      technicianKpi: jest.fn(),
      technicianWorkOrders: jest.fn(),
      findTechnician: jest.fn(),
    };
    mockNames = {
      lookup: jest.fn(),
    };
    service = new ReportsService(
      mockRepo as unknown as ReportsRepository,
      mockNames as unknown as DisplayNameLookup,
    );
  });

  it('computes MTTR, FTFR, work type counts, and summary correctly', async () => {
    const principal = createPrincipal();
    const rawRows: RawTechnicianKpiRow[] = [
      {
        technicianId: TECH_ID,
        employeeCode: 'TECH-01',
        userId: USER_ID,
        branchId: BRANCH_ID,
        status: 'AVAILABLE',
        completedCount: 5,
        resolvedRepairCount: 3,
        eligibleRepairCount: 4,
        onTimeCount: 4,
        scheduledCount: 5,
        firstTimeFixCount: 2,
        totalDurationHours: 15.0, // 15 hours across 5 completed orders
        durationCount: 5,
        repairCount: 3,
        warrantyCount: 1,
        maintenanceCount: 1,
        inspectionCount: 0,
      },
    ];

    (mockRepo.technicianKpi as jest.Mock).mockResolvedValue(rawRows);
    (mockNames.lookup as jest.Mock).mockResolvedValue(
      new Map([
        [USER_ID.toLowerCase(), { name: 'Nguyen Van A' }],
        [BRANCH_ID.toLowerCase(), { name: 'Chi nhanh HCM', code: 'HCM' }],
      ]),
    );

    const query: TechnicianKpiQueryDto = {
      from: '2026-11-01T00:00:00+07:00',
      to: '2026-11-30T00:00:00+07:00',
    };

    const result = await service.technicianKpi(principal, query);

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.technicianId).toBe(TECH_ID);
    expect(item.fullName).toBe('Nguyen Van A');
    expect(item.branchName).toBe('Chi nhanh HCM');
    expect(item.completedCount).toBe(5);
    expect(item.repairSuccessRate).toBe(0.75); // 3 / 4
    expect(item.onTimeRate).toBe(0.8); // 4 / 5
    expect(item.averageMttrHours).toBe(3); // 15 / 5
    expect(item.firstTimeFixRate).toBe(0.5); // 2 / 4
    expect(item.firstTimeFixCount).toBe(2);
    expect(item.repairCount).toBe(3);
    expect(item.warrantyCount).toBe(1);
    expect(item.maintenanceCount).toBe(1);
    expect(item.inspectionCount).toBe(0);

    // Summary checks
    expect(result.summary.totalTechnicians).toBe(1);
    expect(result.summary.totalCompletedCount).toBe(5);
    expect(result.summary.overallMttrHours).toBe(3);
    expect(result.summary.overallFirstTimeFixRate).toBe(0.5);
    expect(result.summary.totalFirstTimeFixCount).toBe(2);
    expect(result.summary.totalRepairCount).toBe(3);
    expect(result.summary.totalWarrantyCount).toBe(1);
    expect(result.summary.totalMaintenanceCount).toBe(1);
    expect(result.summary.totalInspectionCount).toBe(0);
  });

  it('handles technicians with 0 completed orders returning null rates', async () => {
    const principal = createPrincipal();
    const rawRows: RawTechnicianKpiRow[] = [
      {
        technicianId: TECH_ID,
        employeeCode: 'TECH-02',
        userId: USER_ID,
        branchId: BRANCH_ID,
        status: 'AVAILABLE',
        completedCount: 0,
        resolvedRepairCount: 0,
        eligibleRepairCount: 0,
        onTimeCount: 0,
        scheduledCount: 0,
        firstTimeFixCount: 0,
        totalDurationHours: 0,
        durationCount: 0,
        repairCount: 0,
        warrantyCount: 0,
        maintenanceCount: 0,
        inspectionCount: 0,
      },
    ];

    (mockRepo.technicianKpi as jest.Mock).mockResolvedValue(rawRows);
    (mockNames.lookup as jest.Mock).mockResolvedValue(new Map());

    const result = await service.technicianKpi(principal, {
      from: '2026-11-01T00:00:00+07:00',
      to: '2026-11-30T00:00:00+07:00',
    });

    const item = result.items[0];
    expect(item.averageMttrHours).toBeNull();
    expect(item.firstTimeFixRate).toBeNull();
    expect(item.repairSuccessRate).toBeNull();
    expect(item.onTimeRate).toBeNull();
  });
});

describe('ReportsService.technicianWorkOrders (drilldown)', () => {
  let service: ReportsService;
  let mockRepo: jest.Mocked<Partial<ReportsRepository>>;
  let mockNames: jest.Mocked<Partial<DisplayNameLookup>>;

  beforeEach(() => {
    mockRepo = {
      technicianKpi: jest.fn(),
      technicianWorkOrders: jest.fn(),
      findTechnician: jest.fn(),
    };
    mockNames = {
      lookup: jest.fn(),
    };
    service = new ReportsService(
      mockRepo as unknown as ReportsRepository,
      mockNames as unknown as DisplayNameLookup,
    );
  });

  it('returns drilldown work orders with enriched customer and technician names', async () => {
    const principal = createPrincipal();
    (mockRepo.findTechnician as jest.Mock).mockResolvedValue({
      id: TECH_ID,
      employeeCode: 'TECH-01',
      userId: USER_ID,
      branchId: BRANCH_ID,
    });

    const rawOrders: RawTechnicianWorkOrderRow[] = [
      {
        id: '00000000-0000-4000-8000-000000000100',
        workOrderNo: 'WO-2026-0001',
        title: 'Fix pump seal',
        type: 'REPAIR',
        priority: 'HIGH',
        status: 'COMPLETED',
        customerId: CUSTOMER_ID,
        equipmentId: '00000000-0000-4000-8000-000000000200',
        branchId: BRANCH_ID,
        scheduledStart: '2026-11-10T08:00:00.000Z',
        scheduledEnd: '2026-11-10T12:00:00.000Z',
        startedAt: '2026-11-10T08:30:00.000Z',
        completedAt: '2026-11-10T11:00:00.000Z',
        durationHours: 2.5,
        isOnTime: true,
        reportResult: 'RESOLVED',
        isFirstTimeFix: true,
      },
    ];

    (mockRepo.technicianWorkOrders as jest.Mock).mockResolvedValue(rawOrders);
    (mockNames.lookup as jest.Mock).mockImplementation(
      async (domain: string) => {
        if (domain === 'users') {
          return new Map([[USER_ID.toLowerCase(), { name: 'Khuong Tran' }]]);
        }
        if (domain === 'branches') {
          return new Map([
            [BRANCH_ID.toLowerCase(), { name: 'Chi nhanh HCM' }],
          ]);
        }
        if (domain === 'customers') {
          return new Map([
            [CUSTOMER_ID.toLowerCase(), { name: 'Cong ty ABC' }],
          ]);
        }
        return new Map();
      },
    );

    const result = await service.technicianWorkOrders(principal, TECH_ID, {
      from: '2026-11-01T00:00:00+07:00',
      to: '2026-11-30T00:00:00+07:00',
    });

    expect(result.technician.technicianId).toBe(TECH_ID);
    expect(result.technician.fullName).toBe('Khuong Tran');
    expect(result.technician.branchName).toBe('Chi nhanh HCM');
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);

    const wo = result.items[0];
    expect(wo.workOrderNo).toBe('WO-2026-0001');
    expect(wo.customerName).toBe('Cong ty ABC');
    expect(wo.durationHours).toBe(2.5);
    expect(wo.isOnTime).toBe(true);
    expect(wo.isFirstTimeFix).toBe(true);
    expect(wo.reportResult).toBe('RESOLVED');
  });

  it('throws NotFoundException if technician is not found', async () => {
    const principal = createPrincipal();
    (mockRepo.findTechnician as jest.Mock).mockResolvedValue(null);

    await expect(
      service.technicianWorkOrders(principal, TECH_ID, {
        from: '2026-11-01T00:00:00+07:00',
        to: '2026-11-30T00:00:00+07:00',
      }),
    ).rejects.toThrow();
  });
});
