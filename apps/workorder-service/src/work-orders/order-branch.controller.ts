import {
  Body,
  ConflictException,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import {
  AllowUserTypes,
  BranchAccessClient,
  CurrentUser,
  RequirePermissions,
  requireTenantId,
  type Principal,
} from '@pbl6/auth';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import {
  REFERENCES,
  type ReferencesClient,
} from '../references/references.client';

class AllocateOrderBranchDto {
  @IsUUID() branchId: string;
  @IsString() @MinLength(1) @MaxLength(1000) reason: string;
}
@Controller('work-orders')
@AllowUserTypes('TENANT_STAFF')
export class OrderBranchController {
  constructor(
    private readonly db: PrismaService,
    private readonly branches: BranchAccessClient,
    @Inject(REFERENCES) private readonly refs: ReferencesClient,
  ) {}
  @Patch(':id/branch')
  @RequirePermissions('branch:manage')
  async allocate(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AllocateOrderBranchDto,
  ) {
    const tenantId = requireTenantId(p);
    await this.branches.activeBranch(body.branchId, p);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM work_orders WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const row = await tx.workOrder.findFirst({
        where: { tenantId, id },
        include: {
          assignments: {
            where: { status: { in: ['ASSIGNED', 'ACCEPTED'] } },
            include: { technician: true },
          },
        },
      });
      if (!row)
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'Work Order not found',
        });
      if (row.branchId || ['COMPLETED', 'CANCELLED'].includes(row.status))
        throw new ConflictException({
          code: 'BRANCH_ALLOCATION_LOCKED',
          message: 'Only an unallocated open Work Order can be allocated',
        });
      if (row.assignments.some((a) => a.technician.branchId !== body.branchId))
        throw new ConflictException({
          code: 'TECHNICIAN_BRANCH_MISMATCH',
          message: 'Allocation must match the assigned technician branch',
        });
      if (row.serviceRequestId) {
        const source = await this.refs.request(
          row.serviceRequestId,
          p.accessToken,
        );
        if (source?.branchId !== body.branchId)
          throw new ConflictException({
            code: 'REQUEST_BRANCH_MISMATCH',
            message: 'Allocate the source Request to the same branch first',
          });
      }
      await tx.workOrder.update({
        where: { id },
        data: { branchId: body.branchId },
      });
      await tx.workOrderStatusHistory.create({
        data: {
          tenantId,
          workOrderId: id,
          oldStatus: row.status,
          newStatus: row.status,
          changedBy: p.userId,
          reason: `Initial branch ${body.branchId}: ${body.reason}`,
        },
      });
      return { id, branchId: body.branchId };
    });
  }
}
