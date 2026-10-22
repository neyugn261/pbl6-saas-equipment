import { Injectable } from '@nestjs/common';
import { type Principal, requireTenantId } from '@pbl6/auth';
import { type Page, toPage } from '@pbl6/service-kit';
import { conflict, notFound } from '../common/errors';
import type { ListQueryDto } from '../common/validation';
import { IdentityClient } from '../identity/identity.client';
import { requireUser } from '../identity/user-checks';
import {
  type BranchResponse,
  type BranchUserAssignmentResponse,
  toAssignmentResponse,
  toBranchResponse,
} from './branch.response';
import { BranchesRepository } from './branches.repository';
import type {
  AssignBranchUserDto,
  CreateBranchDto,
  UpdateBranchDto,
} from './dto/branch.dto';

@Injectable()
export class BranchesService {
  constructor(
    private readonly branches: BranchesRepository,
    private readonly identity: IdentityClient,
  ) {}

  async list(tenantId: string, query: ListQueryDto): Promise<Page<BranchResponse>> {
    const [rows, total] = await this.branches.list(tenantId, query);
    return toPage(rows.map(toBranchResponse), total, query);
  }

  async get(tenantId: string, id: string): Promise<BranchResponse> {
    return toBranchResponse(await this.load(tenantId, id));
  }

  async create(tenantId: string, input: CreateBranchDto): Promise<BranchResponse> {
    const branch = await this.branches.create({ ...input, tenantId });
    return toBranchResponse(branch);
  }

  async update(
    tenantId: string,
    id: string,
    input: UpdateBranchDto,
  ): Promise<BranchResponse> {
    await this.load(tenantId, id);
    return toBranchResponse(await this.branches.update(id, input));
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.load(tenantId, id);
    if (await this.branches.isInUse(tenantId, id)) {
      throw conflict(
        'BRANCH_IN_USE',
        'The branch is the default branch of a site or has staff assigned',
      );
    }
    await this.branches.update(id, { deletedAt: new Date() });
  }

  async listUsers(
    tenantId: string,
    branchId: string,
  ): Promise<BranchUserAssignmentResponse[]> {
    await this.load(tenantId, branchId);
    const rows = await this.branches.listAssignments(tenantId, branchId);
    return rows.map(toAssignmentResponse);
  }

  /** Only TENANT_STAFF accounts of the same tenant (checked in Identity). */
  async assignUser(
    caller: Principal,
    branchId: string,
    input: AssignBranchUserDto,
  ): Promise<BranchUserAssignmentResponse> {
    const tenantId = requireTenantId(caller);
    await this.load(tenantId, branchId);
    await requireUser(this.identity, caller, input.userId, 'TENANT_STAFF', 'USER_NOT_TENANT_STAFF');
    const assignment = await this.branches.assign(
      tenantId,
      branchId,
      input.userId,
      input.isPrimary ?? false,
    );
    return toAssignmentResponse(assignment);
  }

  async unassignUser(tenantId: string, branchId: string, userId: string): Promise<void> {
    await this.load(tenantId, branchId);
    if (!(await this.branches.unassign(tenantId, branchId, userId))) {
      throw notFound('ASSIGNMENT_NOT_FOUND', 'The user is not assigned to this branch');
    }
  }

  private async load(tenantId: string, id: string) {
    const branch = await this.branches.find(tenantId, id);
    if (!branch) throw notFound('BRANCH_NOT_FOUND', 'Branch not found');
    return branch;
  }
}
