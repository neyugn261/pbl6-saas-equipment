import { Inject, Injectable } from '@nestjs/common';
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
  ) {}
  list(p: Principal, query: ListTechniciansDto) {
    return this.repo.list(requireTenantId(p), query);
  }
  detail(p: Principal, id: string) {
    return this.repo.detail(requireTenantId(p), id);
  }
  me(p: Principal) {
    return this.repo.me(requireTenantId(p), p.userId);
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
    return this.repo.create(tenantId, input);
  }
  async patch(p: Principal, id: string, input: PatchTechnicianDto) {
    const tenantId = requireTenantId(p);
    await this.repo.detail(tenantId, id);
    this.manualStatus(input.status);
    if (input.branchId) await this.branch(input.branchId, p);
    return this.repo.patch(tenantId, id, input);
  }
  replaceSkills(p: Principal, id: string, input: TechnicianSkillDto[]) {
    return this.repo.replaceSkills(requireTenantId(p), id, input);
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
    const branch = await this.refs.branch(id, p.accessToken);
    if (!branch || !sameUuid(branch.id, id) || branch.status !== 'ACTIVE')
      throw invalid('BRANCH_NOT_FOUND', 'Active branch was not found');
  }
}
