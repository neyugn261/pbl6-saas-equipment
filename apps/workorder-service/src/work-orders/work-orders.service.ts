import { Inject, Injectable, Optional } from '@nestjs/common';
import { DisplayNameLookup } from '@pbl6/service-kit';
import type { Principal } from '@pbl6/auth';
import {
  REFERENCES,
  type ReferencesClient,
} from '../references/references.client';
import { invalid, missing } from '../common/errors';
import { sameUuid } from '../common/uuid';
import {
  CreateWorkOrderDto,
  ListWorkOrdersDto,
  PatchWorkOrderDto,
  PRIORITIES,
  WO_TYPES,
} from './dto';
import { WorkOrdersRepository } from './work-orders.repository';

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly repo: WorkOrdersRepository,
    @Inject(REFERENCES) private readonly refs: ReferencesClient,
    @Optional() private readonly names?: DisplayNameLookup,
  ) {}
  async list(p: Principal, query: ListWorkOrdersDto) {
    const page = await this.repo.list(p, query);
    return { ...page, items: await this.display(p, page.items) };
  }
  async detail(p: Principal, id: string) {
    return (await this.display(p, [await this.repo.detail(p, id)]))[0];
  }
  private async display<T extends { currentAssignment: { technicianUserId: string; technicianEmployeeCode: string | null;
      } | null;
    },
  >(p: Principal, rows: T[]) {
    const users = await this.names?.lookup('users', rows.map((row) => row.currentAssignment?.technicianUserId), p,
    );
    return rows.map((row) => ({ ...row,
      currentTechnicianName: row.currentAssignment ? (users?.get(row.currentAssignment.technicianUserId.toLowerCase())?.name ?? null)
        : null,
      currentTechnicianEmployeeCode: row.currentAssignment?.technicianEmployeeCode ?? null,
    }));
  }
  history(p: Principal, id: string) {
    return this.repo.history(p, id);
  }
  patch(p: Principal, id: string, input: PatchWorkOrderDto) {
    return this.repo.patch(p, id, input);
  }
  create(p: Principal, input: CreateWorkOrderDto) {
    return this.repo.create(p, input, async () => {
      const source = await this.refs.request(
        input.serviceRequestId,
        p.accessToken,
      );
      if (!source || !sameUuid(source.id, input.serviceRequestId))
        throw missing('SERVICE_REQUEST_NOT_FOUND');
      if (source.status !== 'ACCEPTED')
        throw invalid(
          'SERVICE_REQUEST_NOT_ACCEPTED',
          'Only an ACCEPTED Service Request can create a Work Order',
        );
      const equipment = await this.refs.equipment(
        source.equipmentId,
        p.accessToken,
      );
      if (
        !equipment ||
        !sameUuid(equipment.id, source.equipmentId) ||
        !sameUuid(equipment.customerId, source.customerId)
      )
        throw invalid(
          'EQUIPMENT_REFERENCE_INVALID',
          'Equipment reference does not match the Service Request',
        );
      if (
        !WO_TYPES.includes(source.type) ||
        !PRIORITIES.includes(source.priority)
      )
        throw invalid(
          'SERVICE_REQUEST_REFERENCE_INVALID',
          'Service Request type or priority is invalid',
        );
      return { source, equipment };
    });
  }
  async reference(p: Principal, id: string) {
    const row = await this.repo.detail(p, id);
    return {
      id: row.id,
      workOrderNo: row.workOrderNo,
      branchId: row.branchId,
      status: row.status,
      equipmentId: row.equipmentId,
      customerId: row.customerId,
      serviceRequestId: row.serviceRequestId,
      maintenanceTaskId: row.maintenanceTaskId,
      currentTechnicianId: row.currentTechnicianId,
    };
  }
}
