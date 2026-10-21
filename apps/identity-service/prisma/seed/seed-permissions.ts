import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { PERMISSIONS, ROLE_PERMISSIONS } from '@pbl6/auth';

/**
 * Upserts the permission catalog and makes role_permissions match
 * ROLE_PERMISSIONS exactly. Safe to run repeatedly. Fails if the catalog
 * references a role that migration 0001_init did not create.
 */
export async function seedPermissions(prisma: PrismaClient): Promise<void> {
  for (const [role, codes] of Object.entries(ROLE_PERMISSIONS)) {
    const unknown = codes.filter((code: string) => !(code in PERMISSIONS));
    if (unknown.length > 0) {
      throw new Error(
        `Role ${role} references unknown permissions: ${unknown.join(', ')}`,
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const [code, name] of Object.entries(PERMISSIONS)) {
      await tx.permission.upsert({
        where: { code },
        create: { code, name },
        update: { name },
      });
    }

    const roles = await tx.role.findMany({ select: { id: true, code: true } });
    const roleIds = new Map(roles.map((role) => [role.code, role.id]));
    const permissions = await tx.permission.findMany({
      select: { id: true, code: true },
    });
    const permissionIds = new Map(
      permissions.map((permission) => [permission.code, permission.id]),
    );

    for (const [roleCode, codes] of Object.entries(ROLE_PERMISSIONS)) {
      const roleId = roleIds.get(roleCode);
      if (!roleId) {
        throw new Error(
          `Role ${roleCode} does not exist; run prisma migrate deploy first`,
        );
      }
      const wanted = codes.map((code) => permissionIds.get(code)!);
      await tx.rolePermission.deleteMany({
        where: { roleId, permissionId: { notIn: wanted } },
      });
      await tx.rolePermission.createMany({
        data: wanted.map((permissionId) => ({ roleId, permissionId })),
        skipDuplicates: true,
      });
    }

    // Permissions removed from the catalog are deleted (links cascade).
    await tx.permission.deleteMany({
      where: { code: { notIn: Object.keys(PERMISSIONS) } },
    });
  });
}
