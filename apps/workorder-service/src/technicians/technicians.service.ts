import { assertBranchAccess, staffBranchId } from '@pbl6/auth';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { DisplayNameLookup } from '@pbl6/service-kit';
import { requireTenantId, type Principal } from '@pbl6/auth';
import {
  REFERENCES,
  type ReferencesClient,
} from '../references/references.client';
import { invalid } from '../common/errors';
import { sameUuid } from '../common/uuid';
import { TechniciansRepository } from './technicians.repository';
import {
  CreateSkillDto,
  CreateTechnicianDto,
  ListTechniciansDto,
  PatchSkillDto,
  PatchTechnicianDto,
  TechnicianSkillDto,
} from './dto';

@Injectable()
export class TechniciansService {
  constructor(
    private readonly repo: TechniciansRepository,
    @Inject(REFERENCES) private readonly refs: ReferencesClient,
    @Optional() private readonly names?: DisplayNameLookup,
  ) {}
  async list(p: Principal, query: ListTechniciansDto) {
    if (query.branchId) assertBranchAccess(p, query.branchId);
    const page = await this.repo.list(requireTenantId(p), {
      ...query,
      ...(staffBranchId(p) ? { branchId: staffBranchId(p)! } : {}),
    });
    return { ...page, items: await this.display(p, page.items) };
  }
  async detail(p: Principal, id: string) {
    const row = await this.repo.detail(requireTenantId(p), id);
    assertBranchAccess(p, row.branchId);
    return (await this.display(p, [row]))[0];
  }
  async me(p: Principal) {
    return (await this.display(p, [await this.repo.me(requireTenantId(p), p.userId)]))[0];
  }
  private async display<T extends { userId: string; branchId: string }>(p: Principal, rows: T[],
  ) {
    const [users, branches] = await Promise.all([
      this.names?.lookup('users', rows.map((row) => row.userId), p,
      ),
      this.names?.lookup('branches', rows.map((row) => row.branchId), p,
      ),
    ]);
    return rows.map((row) => ({ ...row, fullName: users?.get(row.userId.toLowerCase())?.name ?? null,
      branchName: branches?.get(row.branchId.toLowerCase())?.name ?? null,
      branchCode: branches?.get(row.branchId.toLowerCase())?.code ?? null,
    }));
  }
  async create(p: Principal, input: CreateTechnicianDto) {
    const tenantId = requireTenantId(p);
    this.manualStatus(input.status);
    const user = await this.refs.user(input.userId, p.accessToken);
    if (
      !user ||
      !sameUuid(user.id, input.userId) ||
      !sameUuid(user.tenantId, tenantId)
    )
      throw invalid('USER_NOT_FOUND', 'User was not found');
    if (user.userType !== 'TENANT_STAFF' || !user.roles.includes('TECHNICIAN'))
      throw invalid(
        'USER_NOT_TECHNICIAN',
        'User must hold the TECHNICIAN staff role',
      );
    await this.branch(input.branchId, p);
    if (!sameUuid(user.primaryBranchId, input.branchId))
      throw invalid(
        'STAFF_BRANCH_MISMATCH',
        'Assign this user to the same primary branch in Organization first',
      );
    return this.repo.create(tenantId, input);
  }
  async patch(p: Principal, id: string, input: PatchTechnicianDto) {
    const tenantId = requireTenantId(p);
    await this.detail(p, id);
    this.manualStatus(input.status);
    if (input.branchId) {
      await this.branch(input.branchId, p);
      const row = await this.repo.detail(tenantId, id);
      const user = await this.refs.user(row.userId, p.accessToken);
      if (!sameUuid(user?.primaryBranchId, input.branchId))
        throw invalid(
          'STAFF_BRANCH_MISMATCH',
          'Update the primary staff branch in Organization first',
        );
    }
    return this.repo.patch(tenantId, id, input);
  }
  replaceSkills(p: Principal, id: string, input: TechnicianSkillDto[]) {
    return this.detail(p, id).then(() =>
      this.repo.replaceSkills(requireTenantId(p), id, input),
    );
  }
  skills(p: Principal) {
    return this.repo.skills(requireTenantId(p));
  }
  createSkill(p: Principal, input: CreateSkillDto) {
    return this.repo.createSkill(requireTenantId(p), input);
  }
  patchSkill(p: Principal, id: string, input: PatchSkillDto) {
    return this.repo.patchSkill(requireTenantId(p), id, input);
  }
  private manualStatus(status?: string) {
    if (status === 'BUSY')
      throw invalid(
        'TECHNICIAN_STATUS_AUTOMATIC',
        'BUSY is managed from accepted assignments',
      );
  }
  private async branch(id: string, p: Principal) {
    assertBranchAccess(p, id);
    const branch = await this.refs.branch(id, p.accessToken);
    if (!branch || !sameUuid(branch.id, id) || branch.status !== 'ACTIVE')
      throw invalid('BRANCH_NOT_FOUND', 'Active branch was not found');
  }
}
