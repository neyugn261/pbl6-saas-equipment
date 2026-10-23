import { BadRequestException, Injectable } from '@nestjs/common';
import { dataScope, type Principal } from '@pbl6/auth';
import type { Warranty } from '../generated/prisma/client.js';
import { dateString, todayInVietnam } from '../equipment/equipment.repository';
import type { CreateWarrantyDto } from './warranty.dto';
import { WarrantyRepository } from './warranty.repository';

export function warrantyResponse(row: Warranty, today = todayInVietnam()) {
  return {
    id: row.id, equipmentId: row.equipmentId, startDate: dateString(row.startDate),
    endDate: dateString(row.endDate), warrantyType: row.warrantyType, terms: row.terms,
    status: row.status, expired: dateString(row.endDate)! < today,
  };
}

@Injectable()
export class WarrantyService {
  constructor(private readonly repository: WarrantyRepository) {}

  async list(principal: Principal, equipmentId: string) {
    const rows = await this.repository.list(dataScope(principal), equipmentId);
    const today = todayInVietnam();
    return rows.map((row) => warrantyResponse(row, today));
  }

  async add(principal: Principal, equipmentId: string, input: CreateWarrantyDto) {
    if (input.endDate < input.startDate) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'endDate must be on or after startDate' });
    }
    return warrantyResponse(await this.repository.add(dataScope(principal), equipmentId, principal.userId, input));
  }

  async void(principal: Principal, warrantyId: string, reason?: string) {
    return warrantyResponse(await this.repository.void(dataScope(principal), warrantyId, principal.userId, reason));
  }
}
