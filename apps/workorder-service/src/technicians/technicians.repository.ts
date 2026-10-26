import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { toPage, toSkipTake } from '@pbl6/service-kit';
import { badInput, invalid, literalSearch, missing } from '../common/errors';
import {
  CreateSkillDto,
  CreateTechnicianDto,
  ListTechniciansDto,
  PatchSkillDto,
  PatchTechnicianDto,
  TechnicianSkillDto,
} from './dto';

const include = {
  skills: { include: { skill: true }, orderBy: { skillId: 'asc' as const } },
};
type TechnicianRow = Prisma.TechnicianGetPayload<{ include: typeof include }>;
export function technicianView(row: TechnicianRow) {
  return {
    id: row.id,
    userId: row.userId,
    branchId: row.branchId,
    employeeCode: row.employeeCode,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    skills: row.skills.map((s) => ({
      skillId: s.skillId,
      code: s.skill.code,
      name: s.skill.name,
      level: s.level,
    })),
  };
}
const skillView = (s: {
  id: string;
  code: string;
  name: string;
  description: string | null;
}) => ({ id: s.id, code: s.code, name: s.name, description: s.description });

@Injectable()
export class TechniciansRepository {
  constructor(private readonly db: PrismaService) {}
  async list(tenantId: string, query: ListTechniciansDto) {
    const where: Prisma.TechnicianWhereInput = {
      tenantId,
      branchId: query.branchId,
      status: query.status,
      ...(query.q
        ? {
            employeeCode: {
              contains: literalSearch(query.q),
              mode: 'insensitive',
            },
          }
        : {}),
      ...(query.skillId
        ? { skills: { some: { tenantId, skillId: query.skillId } } }
        : {}),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.technician.findMany({
        where,
        include,
        orderBy: [{ employeeCode: 'asc' }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      this.db.technician.count({ where }),
    ]);
    return toPage(rows.map(technicianView), total, query);
  }
  async detail(tenantId: string, id: string) {
    const row = await this.db.technician.findFirst({
      where: { tenantId, id },
      include,
    });
    if (!row) throw missing('TECHNICIAN_NOT_FOUND');
    return technicianView(row);
  }
  async me(tenantId: string, userId: string) {
    const row = await this.db.technician.findFirst({
      where: { tenantId, userId },
      include,
    });
    if (!row) throw missing('TECHNICIAN_PROFILE_MISSING');
    return technicianView(row);
  }
  async create(tenantId: string, input: CreateTechnicianDto) {
    return technicianView(
      await this.db.technician.create({
        data: { ...input, tenantId },
        include,
      }),
    );
  }
  async patch(tenantId: string, id: string, input: PatchTechnicianDto) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM technicians WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      if (!(await tx.technician.findFirst({ where: { tenantId, id } })))
        throw missing('TECHNICIAN_NOT_FOUND');
      let status = input.status;
      if (
        status === 'AVAILABLE' &&
        (await tx.workOrderAssignment.count({
          where: { tenantId, technicianId: id, status: 'ACCEPTED' },
        }))
      )
        status = 'BUSY';
      return technicianView(
        await tx.technician.update({
          where: { id },
          data: { ...input, status },
          include,
        }),
      );
    });
  }
  async replaceSkills(
    tenantId: string,
    id: string,
    entries: TechnicianSkillDto[],
  ) {
    if (
      entries.length > 50 ||
      new Set(entries.map((e) => e.skillId)).size !== entries.length
    )
      throw badInput('Provide at most 50 distinct skills');
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM technicians WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      if (!(await tx.technician.findFirst({ where: { tenantId, id } })))
        throw missing('TECHNICIAN_NOT_FOUND');
      if (
        (await tx.skill.count({
          where: { tenantId, id: { in: entries.map((e) => e.skillId) } },
        })) !== entries.length
      )
        throw invalid('SKILL_NOT_FOUND', 'A skill was not found');
      await tx.technicianSkill.deleteMany({
        where: { tenantId, technicianId: id },
      });
      if (entries.length)
        await tx.technicianSkill.createMany({
          data: entries.map((e) => ({
            tenantId,
            technicianId: id,
            skillId: e.skillId,
            level: e.level ?? null,
          })),
        });
      return technicianView(
        await tx.technician.findUniqueOrThrow({ where: { id }, include }),
      );
    });
  }
  async skills(tenantId: string) {
    return (
      await this.db.skill.findMany({
        where: { tenantId },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
      })
    ).map(skillView);
  }
  async createSkill(tenantId: string, input: CreateSkillDto) {
    return skillView(
      await this.db.skill.create({ data: { ...input, tenantId } }),
    );
  }
  async patchSkill(tenantId: string, id: string, input: PatchSkillDto) {
    return this.db.$transaction(async (tx) => {
      const updated = await tx.skill.updateMany({
        where: { tenantId, id },
        data: input,
      });
      if (!updated.count) throw missing('SKILL_NOT_FOUND');
      return skillView(await tx.skill.findUniqueOrThrow({ where: { id } }));
    });
  }
}
