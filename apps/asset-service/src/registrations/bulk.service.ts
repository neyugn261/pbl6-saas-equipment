import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { dataScope, type Principal } from '@pbl6/auth';
import { isUUID } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EquipmentService } from '../equipment/equipment.service';
import { todayInVietnam } from '../equipment/equipment.repository';
import { RegistrationService, inputHash } from './registration.service';
import { BulkEquipmentUpdateInput, BulkInput, BulkRow, parseEquipmentCsv } from './bulk.dto';
import { dto, invalidInput } from './registration.dto';

@Injectable()
export class BulkHandoverService {
  constructor(
    private readonly db: PrismaService,
    private readonly registrations: RegistrationService,
    private readonly equipment: EquipmentService,
  ) {}

  rows(input: BulkInput) {
    if ((input.csv === undefined) === (input.rows === undefined))
      invalidInput('Provide either csv or rows');
    const rows = (
      input.rows ?? parseEquipmentCsv(input.csv!, input.defaultModelId)
    ).map((row, index) => {
      try { return dto(BulkRow, row); }
      catch { return invalidInput(`Data row ${index + 1}: check modelId, assetCode, serialNumber and optional date/location fields`); }
    });
    if (!rows.length || rows.length > 2000)
      invalidInput('Provide 1–2,000 equipment rows');
    const codes = rows.map((r) => r.assetCode.trim());
    const serials = rows.map(
      (r) => `${r.modelId.toLowerCase()}:${r.serialNumber.trim()}`,
    );
    if (
      new Set(codes).size !== rows.length ||
      new Set(serials).size !== rows.length
    )
      invalidInput('Duplicate asset code or model/serial in this batch');
    return rows;
  }
  private equipmentInput(input: BulkInput, row: BulkRow) {
    return {
      ...row,
      assetCode: row.assetCode.trim(),
      serialNumber: row.serialNumber.trim(),
      customerId: input.customerId,
      customerSiteId: row.customerSiteId ?? input.customerSiteId,
      ...(row.locationId || !input.defaultLocationId ? {} : { locationId: input.defaultLocationId }),
    };
  }
  async preview(p: Principal, input: BulkInput) {
    const rows = this.rows(input),
      tenantId = dataScope(p).tenantId;
    const results: { row: number; valid: boolean; message?: string }[] = [];
    const validated = new Set<string>();
    for (const [index, row] of rows.entries()) {
      try {
        if (row.handoverDate && row.handoverDate > todayInVietnam())
          throw new Error('Actual handover date cannot be in the future');
        const effectiveSiteId = row.customerSiteId ?? input.customerSiteId;
        const referenceKey = `${row.modelId}:${effectiveSiteId}:${row.locationId ?? input.defaultLocationId ?? ''}`;
        if (!validated.has(referenceKey)) {
          await this.equipment.validateCreate(
            p,
            this.equipmentInput(input, row),
          );
          validated.add(referenceKey);
        }
        const existing = await this.db.equipment.findFirst({
          where: {
            tenantId,
            OR: [
              { assetCode: row.assetCode.trim() },
              { modelId: row.modelId, serialNumber: row.serialNumber.trim() },
            ],
          },
          select: { id: true },
        });
        if (existing)
          throw new Error('Asset code or model/serial already exists');
        results.push({ row: index + 1, valid: true });
      } catch (error) {
        results.push({
          row: index + 1,
          valid: false,
          message: error instanceof Error ? error.message : 'Invalid equipment',
        });
      }
    }
    return {
      valid: results.every((r) => r.valid),
      count: rows.length,
      rows: results,
      nextStep: 'CREATE_DRAFTS_THEN_CONFIRM_POLICIES_PER_EQUIPMENT',
    };
  }
  async create(p: Principal, input: BulkInput, key: string) {
    if (!isUUID(key)) invalidInput('Idempotency-Key must be a UUID');
    const tenantId = dataScope(p).tenantId,
      rows = this.rows(input);
    const hash = inputHash({ ...input, csv: undefined, rows });
    const prior = await this.db.bulkHandover.findFirst({
      where: { id: key, tenantId, actorId: p.userId },
    });
    if (prior) return this.replay(prior, hash);
    const check = await this.preview(p, input);
    if (!check.valid) {
      const completed = await this.db.bulkHandover.findFirst({
        where: { id: key, tenantId, actorId: p.userId },
      });
      if (completed) return this.replay(completed, hash);
      throw new UnprocessableEntityException({
        code: 'BULK_VALIDATION_FAILED',
        message: 'Correct invalid rows',
        details: check,
      });
    }
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`bulk:${tenantId}:${key}`},0))::text`;
        const replay = await tx.bulkHandover.findFirst({
          where: { id: key, tenantId, actorId: p.userId },
        });
        if (replay) return this.replay(replay, hash);
        const registrations = [];
        for (const row of rows) {
          const registration = await this.registrations.create(
            p,
            {
              deliveryMethod: input.deliveryMethod,
              equipment: { mode: 'NEW', data: this.equipmentInput(input, row) },
            },
            randomUUID(),
            tx,
          );
          registrations.push({
            ...registration,
            equipmentSummary: {
              assetCode: row.assetCode.trim(),
              serialNumber: row.serialNumber.trim(),
              displayName: row.displayName?.trim() ?? null,
            },
          });
        }
        const result = JSON.parse(
          JSON.stringify({
            id: key,
            status: 'DRAFTS_CREATED',
            registrations,
            nextStep: check.nextStep,
          }),
        );
        await tx.bulkHandover.create({
          data: {
            id: key,
            tenantId,
            actorId: p.userId,
            requestHash: hash,
            result,
          },
        });
        return result;
      },
      { timeout: 60000 },
    );
  }
  private replay(row: { requestHash: string; result: unknown }, hash: string) {
    if (row.requestHash !== hash)
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Key belongs to another batch',
      });
    return row.result;
  }
  async result(p: Principal, id: string) {
    const row = await this.db.bulkHandover.findFirst({
      where: { id, tenantId: dataScope(p).tenantId, actorId: p.userId },
    });
    if (!row) throw new NotFoundException();
    return row.result;
  }

  async previewUpdate(p: Principal, input: BulkEquipmentUpdateInput) {
    const ids = input.rows.map(row => row.equipmentId.toLowerCase());
    if (new Set(ids).size !== ids.length) invalidInput('Duplicate equipmentId in update file');
    const results = [];
    for (const [index, row] of input.rows.entries()) {
      try {
        if (![row.purchaseDate, row.handoverDate, row.installationDate, row.customerSiteId, row.locationId].some(value => value !== undefined))
          throw new Error('Dòng không có trường cần cập nhật.');
        const { equipmentId, updatedAt, ...patch } = row;
        const current = await this.equipment.validateBulkPatch(p, equipmentId, patch, updatedAt);
        results.push({ row: index + 1, equipmentId: row.equipmentId, valid: true, assetCode: current.assetCode });
      } catch (error) {
        results.push({ row: index + 1, equipmentId: row.equipmentId, valid: false, message: error instanceof Error ? error.message : 'Không thể đọc thiết bị trong phạm vi hiện tại' });
      }
    }
    return { valid: results.every(row => row.valid), count: results.length, rows: results };
  }

  async update(p: Principal, input: BulkEquipmentUpdateInput, key: string) {
    if (!isUUID(key)) invalidInput('Idempotency-Key must be a UUID');
    const tenantId = dataScope(p).tenantId;
    const hash = inputHash({ kind: 'EQUIPMENT_UPDATE', rows: input.rows });
    const prior = await this.db.bulkHandover.findFirst({ where: { id: key, tenantId, actorId: p.userId } });
    if (prior) return this.replay(prior, hash);
    const check = await this.previewUpdate(p, input);
    const results = [];
    for (const [index, row] of input.rows.entries()) {
      const validation = check.rows[index];
      if (!validation.valid) { results.push(validation); continue; }
      try {
        const { equipmentId, updatedAt, ...patch } = row;
        results.push({ row: index + 1, equipmentId, valid: true, result: await this.equipment.patch(p, equipmentId, patch, updatedAt, key) });
      } catch (error) {
        results.push({ row: index + 1, equipmentId: row.equipmentId, valid: false, message: error instanceof Error ? error.message : 'Update failed' });
      }
    }
    const result = { id: key, status: results.every(row => row.valid) ? 'COMPLETED' : 'PARTIAL', count: results.length, rows: results };
    await this.db.bulkHandover.create({ data: { id: key, tenantId, actorId: p.userId, requestHash: hash, result: JSON.parse(JSON.stringify(result)) } });
    return result;
  }
}
