import {
  Body,
  Controller,
  Get,
  Param,
  ParseArrayPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  AllowUserTypes,
  CurrentUser,
  RequirePermissions,
  type Principal,
} from '@pbl6/auth';
import {
  CreateSkillDto,
  CreateTechnicianDto,
  ListTechniciansDto,
  PatchSkillDto,
  PatchTechnicianDto,
  TechnicianSkillDto,
} from './dto';
import { TechniciansService } from './technicians.service';

@Controller('technicians')
@AllowUserTypes('TENANT_STAFF')
export class TechniciansController {
  constructor(private readonly service: TechniciansService) {}
  @Get()
  @RequirePermissions('work_order:read')
  list(@CurrentUser() p: Principal, @Query() q: ListTechniciansDto) {
    return this.service.list(p, q);
  }
  @Post()
  @RequirePermissions('technician:manage')
  create(@CurrentUser() p: Principal, @Body() input: CreateTechnicianDto) {
    return this.service.create(p, input);
  }
  @Get('me')
  @RequirePermissions('work_order:execute')
  me(@CurrentUser() p: Principal) {
    return this.service.me(p);
  }
  @Get(':id')
  @RequirePermissions('work_order:read')
  detail(@CurrentUser() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(p, id);
  }
  @Patch(':id')
  @RequirePermissions('technician:manage')
  patch(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PatchTechnicianDto,
  ) {
    return this.service.patch(p, id, input);
  }
  @Put(':id/skills')
  @RequirePermissions('technician:manage')
  skills(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new ParseArrayPipe({
        items: TechnicianSkillDto,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    input: TechnicianSkillDto[],
  ) {
    return this.service.replaceSkills(p, id, input);
  }
}
@Controller('skills')
@AllowUserTypes('TENANT_STAFF')
export class SkillsController {
  constructor(private readonly service: TechniciansService) {}
  @Get()
  @RequirePermissions('work_order:read')
  list(@CurrentUser() p: Principal) {
    return this.service.skills(p);
  }
  @Post()
  @RequirePermissions('technician:manage')
  create(@CurrentUser() p: Principal, @Body() input: CreateSkillDto) {
    return this.service.createSkill(p, input);
  }
  @Patch(':id')
  @RequirePermissions('technician:manage')
  patch(
    @CurrentUser() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PatchSkillDto,
  ) {
    return this.service.patchSkill(p, id, input);
  }
}
