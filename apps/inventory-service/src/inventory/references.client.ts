import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceHttpClient, UpstreamError } from '@pbl6/service-kit';
import type { Principal } from '@pbl6/auth';

export interface BranchReference {
  id: string;
  status: string;
}
export interface WorkOrderReference {
  branchId?: string | null;
  id: string;
  status: string;
  equipmentId?: string;
  customerId?: string;
  workOrderNo?: string;
  currentTechnicianId?: string;
  currentAssignment?: { technicianUserId: string } | null;
}
export interface ReservationRequest {
  requestId: string;
  fingerprint: string;
}
export interface Reservation extends ReservationRequest {
  workOrderId: string;
  state: 'HELD' | 'COMMITTED' | 'RELEASED';
}
export interface SettlementRequest extends ReservationRequest {
  outcome: 'COMMITTED' | 'ABORTED';
}

@Injectable()
export class ReferencesClient {
  private readonly organization: ServiceHttpClient;
  private readonly workorders: ServiceHttpClient;
  private readonly assets?: ServiceHttpClient;
  constructor(config: ConfigService) {
    this.organization = new ServiceHttpClient({
      name: 'organization-service',
      baseUrl: config.getOrThrow('ORGANIZATION_SERVICE_URL'),
      timeoutMs: 3000,
    });
    this.workorders = new ServiceHttpClient({
      name: 'workorder-service',
      baseUrl: config.getOrThrow('WORKORDER_SERVICE_URL'),
      timeoutMs: 3000,
    });
    const assetUrl = config.get<string>('ASSET_SERVICE_URL');
    if (assetUrl)
      this.assets = new ServiceHttpClient({
        name: 'asset-service',
        baseUrl: assetUrl,
        timeoutMs: 3000,
      });
  }
  branch(id: string, p: Principal) {
    return this.organization.getOrNull<BranchReference>(
      `/internal/branches/${id}`,
      { accessToken: p.accessToken },
    );
  }
  workOrder(id: string, p: Principal) {
    return this.workorders.getOrNull<WorkOrderReference>(
      `/internal/work-orders/${id}`,
      { accessToken: p.accessToken },
    );
  }
  workOrderDetail(id: string, p: Principal) {
    return this.workorders.getOrNull<WorkOrderReference>(`/work-orders/${id}`, {
      accessToken: p.accessToken,
    });
  }
  serviceReport(id: string, p: Principal) {
    return this.workorders.getOrNull<{
      id: string;
      workOrderId: string;
      technicianId: string;
    }>(`/work-orders/${id}/service-report`, { accessToken: p.accessToken });
  }
  assignments(id: string, p: Principal) {
    return this.workorders.get<
      { technicianId: string; technicianUserId: string; status: string }[]
    >(`/work-orders/${id}/assignments`, { accessToken: p.accessToken });
  }
  equipment(id: string, p: Principal) {
    if (!this.assets)
      throw new ServiceUnavailableException({
        code: 'ASSET_REFERENCE_UNAVAILABLE',
        message: 'Equipment access cannot be verified',
      });
    return this.assets.getOrNull<{ id: string; customerId: string }>(
      `/internal/equipment/${id}`,
      { accessToken: p.accessToken },
    );
  }
  reserve(id: string, body: ReservationRequest, p: Principal) {
    return this.reservationCall(id, '', body, p);
  }
  settle(id: string, body: SettlementRequest, p: Principal) {
    return this.reservationCall(id, '/settle', body, p);
  }
  private async reservationCall(
    id: string,
    suffix: string,
    body: ReservationRequest | SettlementRequest,
    p: Principal,
  ): Promise<Reservation> {
    let result: Reservation;
    try {
      result = await this.workorders.post<Reservation>(
        `/internal/work-orders/${id}/inventory-reservations${suffix}`,
        body,
        { accessToken: p.accessToken },
      );
    } catch (error) {
      if (
        error instanceof UpstreamError &&
        (error.status === 404 || error.status === 405)
      ) {
        throw new ServiceUnavailableException({
          code: 'WO_RESERVATION_UNAVAILABLE',
          message:
            'Work Order reservation is required before parts can be issued',
        });
      }
      // Owner-defined business conflicts keep their semantics; no fallback to GET status.
      if (error instanceof UpstreamError && error.status === 409) {
        throw new ConflictException({
          code: 'WO_RESERVATION_CONFLICT',
          message: 'Work Order cannot grant this inventory reservation',
        });
      }
      throw error;
    }
    if (
      !result ||
      result.requestId !== body.requestId ||
      result.workOrderId !== id ||
      result.fingerprint !== body.fingerprint ||
      !['HELD', 'COMMITTED', 'RELEASED'].includes(result.state)
    ) {
      throw new ServiceUnavailableException({
        code: 'INVALID_RESERVATION_RESPONSE',
        message: 'Work Order returned an invalid reservation response',
      });
    }
    return result;
  }
}
