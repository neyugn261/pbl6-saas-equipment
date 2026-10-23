import { BadRequestException, ConflictException, Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { assertInScope, dataScope, type Principal } from '@pbl6/auth';
import { toPage, type Page } from '@pbl6/service-kit';
import type { Equipment, EquipmentHistory, EquipmentModel, Warranty } from '../generated/prisma/client.js';
import { EquipmentModelRepository } from '../equipment-models/equipment-model.repository';
import { ORGANIZATION_CLIENT, type OrganizationClient } from '../organization/organization-client';
import type { CreateEquipmentDto, HistoryQueryDto, ListEquipmentQueryDto, PatchEquipmentDto } from './dto/equipment.dto';
import { dateString, EquipmentRepository, todayInVietnam } from './equipment.repository';

export interface EquipmentResponse {
  id: string; modelId: string; customerId: string; customerSiteId: string; locationId: string | null;
  assetCode: string; serialNumber: string; installationDate: string | null; handoverDate: string | null;
  status: string; createdAt: string; updatedAt: string;
}

export function equipmentResponse(row: Equipment): EquipmentResponse {
  return {
    id: row.id, modelId: row.modelId, customerId: row.customerId,
    customerSiteId: row.customerSiteId, locationId: row.locationId,
    assetCode: row.assetCode, serialNumber: row.serialNumber,
    installationDate: dateString(row.installationDate), handoverDate: dateString(row.handoverDate),
    status: row.status, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

function modelResponse(row: EquipmentModel) {
  return { id: row.id, manufacturer: row.manufacturer, modelCode: row.modelCode,
    name: row.name, category: row.category, description: row.description, status: row.status,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function historyResponse(row: EquipmentHistory) {
  return { id: row.id, equipmentId: row.equipmentId, eventType: row.eventType,
    referenceType: row.referenceType, referenceId: row.referenceId, description: row.description,
    metadata: row.metadata, createdBy: row.createdBy, occurredAt: row.occurredAt.toISOString() };
}

function invalidReference(code: string): never {
  throw new UnprocessableEntityException({ code, message: 'Reference cannot be validated' });
}

@Injectable()
export class EquipmentService {
  constructor(
    private readonly repository: EquipmentRepository,
    private readonly models: EquipmentModelRepository,
    @Inject(ORGANIZATION_CLIENT) private readonly organization: OrganizationClient,
  ) {}

  async list(principal: Principal, query: ListEquipmentQueryDto): Promise<Page<EquipmentResponse>> {
    const { rows, total } = await this.repository.list(dataScope(principal), query);
    return toPage(rows.map(equipmentResponse), total, query);
  }

  async create(principal: Principal, input: CreateEquipmentDto): Promise<EquipmentResponse> {
    const { tenantId } = dataScope(principal);
    const model = await this.models.findScoped(tenantId, input.modelId);
    if (!model) invalidReference('MODEL_NOT_FOUND');
    if (model.status !== 'ACTIVE') invalidReference('MODEL_INACTIVE');
    await this.validateCustomer(input.customerId, principal);
    await this.validateSite(input.customerId, input.customerSiteId, input.locationId, principal);
    return equipmentResponse(await this.repository.createWithHistory(tenantId, principal.userId, input));
  }

  async detail(principal: Principal, id: string) {
    const scope = dataScope(principal);
    const row = assertInScope(scope, await this.repository.findDetail(scope, id), 'EQUIPMENT_NOT_FOUND');
    const date = todayInVietnam();
    const warranty = await this.repository.warrantyAt(scope.tenantId, id, date);
    return { ...equipmentResponse(row), model: modelResponse(row.model as EquipmentModel),
      warranty: this.warrantyResponse(id, date, warranty), hasActiveQr: row.qrCodes.length > 0 };
  }

  async warrantyStatus(principal: Principal, id: string, date = todayInVietnam()) {
    const scope = dataScope(principal);
    assertInScope(scope, await this.repository.findScoped(scope, id), 'EQUIPMENT_NOT_FOUND');
    const warranty = await this.repository.warrantyAt(scope.tenantId, id, date);
    return this.warrantyResponse(id, date, warranty);
  }

  private warrantyResponse(equipmentId: string, date: string, warranty: Warranty | null) {
    const result = !warranty ? 'NO_WARRANTY'
      : dateString(warranty.startDate)! <= date && date <= dateString(warranty.endDate)!
        ? 'IN_WARRANTY' : 'OUT_OF_WARRANTY';
    return { equipmentId, date, result, warrantyId: warranty?.id ?? null,
      endDate: warranty ? dateString(warranty.endDate) : null };
  }

  async patch(principal: Principal, id: string, input: PatchEquipmentDto): Promise<EquipmentResponse> {
    if (Object.values(input).every((value) => value === undefined)) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'At least one equipment field is required' });
    }
    const scope = dataScope(principal);
    const before = assertInScope(scope, await this.repository.findScoped(scope, id), 'EQUIPMENT_NOT_FOUND');
    if (before.status === 'RETIRED') {
      throw new ConflictException({ code: 'EQUIPMENT_RETIRED', message: 'Retired equipment cannot be changed' });
    }
    // Skip Organization on date/status-only patches. A changed site with no
    // location clears the old location; a non-null location is checked at its effective site.
    if (input.customerSiteId !== undefined || input.locationId !== undefined) {
      await this.validateSite(before.customerId, input.customerSiteId ?? before.customerSiteId,
        input.locationId ?? undefined, principal);
    }
    // A location-only PATCH was validated against this site. Detect a site
    // change between the Organization lookup and the locked database write.
    const validatedSiteId = input.customerSiteId === undefined && input.locationId != null
      ? before.customerSiteId : undefined;
    return equipmentResponse(await this.repository.patchWithHistory(scope, id, principal.userId, input, validatedSiteId));
  }

  async reference(principal: Principal, id: string) {
    const scope = dataScope(principal);
    const row = assertInScope(scope, await this.repository.findScoped(scope, id), 'EQUIPMENT_NOT_FOUND');
    return { id: row.id, customerId: row.customerId, customerSiteId: row.customerSiteId,
      locationId: row.locationId, status: row.status, assetCode: row.assetCode };
  }

  async history(principal: Principal, id: string, query: HistoryQueryDto) {
    const { rows, total } = await this.repository.history(dataScope(principal), id, query.page, query.pageSize);
    return toPage(rows.map(historyResponse), total, query);
  }

  private async validateCustomer(customerId: string, principal: Principal): Promise<void> {
    const customer = await this.organization.getCustomer(customerId, principal);
    if (!customer || customer.id !== customerId) {
      invalidReference('CUSTOMER_NOT_FOUND');
    }
  }

  private async validateSite(customerId: string, siteId: string, locationId: string | undefined, principal: Principal): Promise<void> {
    const site = await this.organization.getSite(customerId, siteId, undefined, principal);
    if (!site || site.customerId !== customerId || site.siteId !== siteId) {
      invalidReference('SITE_NOT_OF_CUSTOMER');
    }
    if (locationId !== undefined) {
      const located = await this.organization.getSite(customerId, siteId, locationId, principal);
      if (!located || located.customerId !== customerId || located.siteId !== siteId || located.locationId !== locationId) {
        invalidReference('LOCATION_NOT_IN_SITE');
      }
    }
  }
}
