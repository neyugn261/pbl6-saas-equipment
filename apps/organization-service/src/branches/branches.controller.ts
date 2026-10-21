import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  type Principal,
  RequirePermissions,
  requireTenantId,
} from '@pbl6/auth';
import type { Page } from '@pbl6/service-kit';
import { ListQueryDto } from '../common/validation';
import type { BranchResponse } from './branch.response';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

/** Internal branches of the vendor; staff only. */
@Controller('branches')
@AllowUserTypes('TENANT_STAFF')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @RequirePermissions('branch:read')
  list(
    @Query() query: ListQueryDto,
    @CurrentUser() user: Principal,
  ): Promise<Page<BranchResponse>> {
    return this.branches.list(requireTenantId(user), query);
  }

  @Post()
  @RequirePermissions('branch:manage')
  create(
    @Body() body: CreateBranchDto,
    @CurrentUser() user: Principal,
  ): Promise<BranchResponse> {
    return this.branches.create(requireTenantId(user), body);
  }

  @Get(':branchId')
  @RequirePermissions('branch:read')
  get(
    @Param('branchId', ParseUUIDPipe) id: string,
    @CurrentUser() user: Principal,
  ): Promise<BranchResponse> {
    return this.branches.get(requireTenantId(user), id);
  }

  @Patch(':branchId')
  @RequirePermissions('branch:manage')
  update(
    @Param('branchId', ParseUUIDPipe) id: string,
    @Body() body: UpdateBranchDto,
    @CurrentUser() user: Principal,
  ): Promise<BranchResponse> {
    return this.branches.update(requireTenantId(user), id, body);
  }

  @Delete(':branchId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('branch:manage')
  remove(
    @Param('branchId', ParseUUIDPipe) id: string,
    @CurrentUser() user: Principal,
  ): Promise<void> {
    return this.branches.remove(requireTenantId(user), id);
  }
}
