import type { Principal } from '@pbl6/auth';
import type { DisplayNameLookup } from '@pbl6/service-kit';
import { TechniciansService } from '../technicians/technicians.service';
import type { TechniciansRepository } from '../technicians/technicians.repository';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import type { WorkOrdersRepository } from '../work-orders/work-orders.repository';
import { WorkOrderWorkflowService } from '../work-orders/workflow.service';
import type { WorkOrderWorkflowRepository } from '../work-orders/workflow.repository';
import type { ReferencesClient } from './references.client';

describe('Work Order display enrichment', () => {
  const p = {
    sessionId: 'session',
    customerId: null,
    permissions: new Set(),
    expiresAt: new Date(),
    branchId: 'branch',
    roles: ['SERVICE_MANAGER'],
    tenantId: 'tenant', userId: 'actor', accessToken: 'caller', userType: 'TENANT_STAFF',
  } as Principal;
  const refs = {} as ReferencesClient;
  const calls: string[][] = [];
  const names = { lookup: async (_kind: string, ids: string[]) => {
    calls.push(ids); return new Map([['user', { name: 'Nguyễn Văn A' }], ['branch', { name: 'Hà Nội', code: 'HN' }],
      ]);
  },
  } as unknown as DisplayNameLookup;
  beforeEach(() => { calls.length = 0; });
  it('keeps inactive technicians, IDs, statuses and pagination; uses one user batch per page', async () => {
    const row = { id: 'tech', userId: 'user', branchId: 'branch', status: 'INACTIVE', employeeCode: 'TECH-001',
    };
    const repo = { list: async () => ({ items: [row, row], total: 202, page: 6, pageSize: 20,
      }),
    } as unknown as TechniciansRepository;
    const result = await new TechniciansService(repo, refs, names).list(p, { page: 6, pageSize: 20,
    });
    expect(result).toMatchObject({ total: 202, page: 6, items: [{ ...row, fullName: 'Nguyễn Văn A', branchName: 'Hà Nội' }, { ...row, fullName: 'Nguyễn Văn A' },
      ],
    });
    expect(calls).toHaveLength(2); // one identity batch and one organization batch
  });
  it('resolves current technician by its user reference without altering assignment', async () => {
    const row = { id: 'wo', currentTechnicianId: 'tech', currentAssignment: { technicianUserId: 'user', technicianEmployeeCode: 'T1',
      },
    };
    const repo = { detail: async () => row } as unknown as WorkOrdersRepository;
    expect(await new WorkOrdersService(repo, refs, names).detail(p, 'wo'),
    ).toEqual({ ...row, currentTechnicianName: 'Nguyễn Văn A', currentTechnicianEmployeeCode: 'T1',
    });
    expect(row).not.toHaveProperty('currentTechnicianName');
  });
  it('enriches historical assignments using their own user ID, not the active technician list', async () => {
    const rows = [{ id: 'old', technicianId: 'old-tech', technicianUserId: 'user', assignedBy: 'actor', status: 'UNASSIGNED',
      },
      { id: 'missing', technicianId: 'missing-tech', technicianUserId: 'missing', assignedBy: 'actor', status: 'REJECTED',
      },
    ];
    const repo = { assignments: async () => rows,
    } as unknown as WorkOrderWorkflowRepository;
    const result = await new WorkOrderWorkflowService(repo, names).assignments(p, 'wo',
    );
    expect(result[0]).toMatchObject({ ...rows[0], technicianName: 'Nguyễn Văn A',
    });
    expect(result[1]).toMatchObject({ ...rows[1], technicianName: null });
    expect(calls).toHaveLength(1);
  });
});
