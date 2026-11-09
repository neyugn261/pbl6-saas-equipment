import { Injectable } from '@nestjs/common';
import { toSkipTake } from '@pbl6/service-kit';
import { codeOrNameMatches, type ListQueryDto } from '../common/validation';
import {
  Branch,
  BranchUserAssignment,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { enqueueSiteRouting } from '../sites/site-routing';

/** Data access for internal branches (organization_db only). Soft-deleted rows are never returned. */
@Injectable()
export class BranchesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async primaryBranch(tenantId: string, userId: string) {
    const assignment = await this.prisma.branchUserAssignment.findFirst({
      where: {
        tenantId,
        userId,
        isPrimary: true,
        branch: { deletedAt: null, status: 'ACTIVE' },
      },
      include: { branch: true },
    });
    return assignment?.branch ?? null;
  }

  displayNames(tenantId: string, ids: string[]) {
    return this.prisma.branch.findMany({
      where: { tenantId, id: { in: [...new Set(ids)] }, deletedAt: null },
      select: { id: true, tenantId: true, name: true, code: true },
    });
  }

  async list(tenantId: string, query: ListQueryDto,
  ): Promise<[Branch[], number]> {
    const where: Prisma.BranchWhereInput = {
      tenantId,
      deletedAt: null,
      status: query.status,
      ...codeOrNameMatches(query.q),
    };
    return this.prisma.$transaction([
      this.prisma.branch.findMany({
        where,
        orderBy: { code: 'asc' },
        ...toSkipTake(query),
      }),
      this.prisma.branch.count({ where }),
    ]);
  }

  find(tenantId: string, id: string): Promise<Branch | null> {
    return this.prisma.branch.findFirst({ where: { id, tenantId, deletedAt: null },
    });
  }

  create(data: Prisma.BranchUncheckedCreateInput): Promise<Branch> {
    return this.prisma.branch.create({ data });
  }

  update(id: string, data: Prisma.BranchUncheckedUpdateInput): Promise<Branch> {
    return this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.update({ where: { id }, data });
      if (data.status !== undefined || data.deletedAt !== undefined) {
        const sites = await tx.customerSite.findMany({
          where: { tenantId: branch.tenantId, defaultServicingBranchId: id },
        });
        for (const site of sites) {
          const changed = await tx.customerSite.update({
            where: { id: site.id },
            data: { routingVersion: { increment: 1 } },
          });
          await enqueueSiteRouting(tx, changed);
        }
      }
      return branch;
    });
  }

  listAssignments(tenantId: string, branchId: string,
  ): Promise<BranchUserAssignment[]> {
    return this.prisma.branchUserAssignment.findMany({
      where: { tenantId, branchId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Assigns the user to the branch, or updates `isPrimary` of an existing
   * assignment. A primary branch takes the flag from the user's previous
   * primary branch in the same transaction (uq_branch_user_assignments_primary).
   */
  assign(
    tenantId: string,
    branchId: string,
    userId: string,
    isPrimary: boolean,
  ): Promise<BranchUserAssignment> {
    return this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.branchUserAssignment.updateMany({
          where: { tenantId, userId, isPrimary: true, branchId: { not: branchId },
          },
          data: { isPrimary: false },
        });
      }
      return tx.branchUserAssignment.upsert({
        where: { branchId_userId: { branchId, userId } },
        create: { tenantId, branchId, userId, isPrimary },
        update: { isPrimary },
      });
    });
  }

  /** False when the user was not assigned to the branch. */
  async unassign(tenantId: string, branchId: string, userId: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.branchUserAssignment.deleteMany({
      where: { tenantId, branchId, userId },
    });
    return count > 0;
  }

  /** Live sites that use the branch as default servicing branch, or staff assigned to it. */
  async isInUse(tenantId: string, id: string): Promise<boolean> {
    const [sites, assignments] = await this.prisma.$transaction([
      this.prisma.customerSite.count({
        where: { tenantId, defaultServicingBranchId: id, deletedAt: null },
      }),
      this.prisma.branchUserAssignment.count({ where: { tenantId, branchId: id },
      }),
    ]);
    return sites > 0 || assignments > 0;
  }
}
