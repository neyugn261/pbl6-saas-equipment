import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '@pbl6/auth';
import { PrismaService } from '../prisma/prisma.service';

@Controller('roles')
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('role:read')
  async listRoles() {
    const items = await this.prisma.role.findMany({
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        userType: true,
      },
    });
    return { items };
  }
}
