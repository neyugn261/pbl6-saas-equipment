import {
  Body,
  ConflictException,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  NotFoundException,
} from '@nestjs/common';
import {
  AllowUserTypes,
  BranchAccessClient,
  CurrentUser,
  RequirePermissions,
  requireTenantId,
  type Principal,
} from '@pbl6/auth';
import {
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Events, enqueueEvent } from '@pbl6/event-contracts';
import { PrismaService } from '../prisma/prisma.service';

class AllocateBranchDto {
  @IsUUID() branchId: string;
  @ValidateIf((_o, v) => v !== null) @IsUUID() expectedBranchId: string | null;
  @IsString() @MinLength(1) @MaxLength(1000) reason: string;
}

@Controller('service-requests')
@AllowUserTypes('TENANT_STAFF')
export class RequestBranchController {
  constructor(
    private readonly db: PrismaService,
    private readonly branches: BranchAccessClient,
  ) {}
  @Patch(':id/branch')
  @RequirePermissions('branch:manage')
  async allocate(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AllocateBranchDto,
  ) {
    const tenantId = requireTenantId(p);
    await this.branches.activeBranch(body.branchId, p);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM service_requests WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const row = await tx.serviceRequest.findFirst({
        where: { tenantId, id },
      });
      if (!row)
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'Request not found',
        });
      if (row.branchId !== body.expectedBranchId)
        throw new ConflictException({
          code: 'BRANCH_VERSION_CONFLICT',
          message: 'Reload the request before allocating',
        });
      if (
        ['RESOLVED', 'CLOSED', 'REJECTED', 'CANCELLED'].includes(row.status) ||
        (row.branchId !== null &&
          (!['NEW', 'REVIEWING', 'AWAITING_INFO'].includes(row.status) ||
            row.activeWorkOrderId))
      )
        throw new ConflictException({
          code: 'BRANCH_ALLOCATION_LOCKED',
          message: 'This request can no longer change branch',
        });
      const updated = await tx.serviceRequest.update({
        where: { id },
        data: { branchId: body.branchId },
      });
      await tx.requestStatusHistory.create({
        data: {
          tenantId,
          requestId: id,
          oldStatus: row.status,
          newStatus: row.status,
          changedBy: p.userId,
          reason: `Branch ${row.branchId ?? 'UNALLOCATED'} -> ${body.branchId}: ${body.reason}`,
        },
      });
      await enqueueEvent(tx, Events.ServiceRequestBranchAssigned, {
        tenantId,
        aggregateId: id,
        payload: {
          serviceRequestId: id,
          requestNo: row.requestNo,
          branchId: body.branchId,
          customerId: row.customerId,
          equipmentId: row.equipmentId,
          requesterId: row.requesterId,
          type: row.type as 'REPAIR',
          priority: row.priority as 'NORMAL',
        },
      });
      return { id: updated.id, branchId: updated.branchId };
    });
  }
}
