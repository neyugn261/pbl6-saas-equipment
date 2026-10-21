import { Injectable } from '@nestjs/common';
import { type Page, toPage } from '@pbl6/service-kit';
import { conflict, notFound } from '../common/errors';
import type { ListQueryDto } from '../common/validation';
import { type BranchResponse, toBranchResponse } from './branch.response';
import { BranchesRepository } from './branches.repository';
import type { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly branches: BranchesRepository) {}

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

  private async load(tenantId: string, id: string) {
    const branch = await this.branches.find(tenantId, id);
    if (!branch) throw notFound('BRANCH_NOT_FOUND', 'Branch not found');
    return branch;
  }
}
