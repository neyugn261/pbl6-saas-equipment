import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceHttpClient, UpstreamError } from '@pbl6/service-kit';
import type { Principal } from '@pbl6/auth';
import { reservationConflict } from './proof';

@Injectable()
export class InventoryProofClient {
  private readonly client?: ServiceHttpClient;
  constructor(config: ConfigService) {
    const baseUrl = config.get<string>('INVENTORY_SERVICE_URL');
    if (baseUrl)
      this.client = new ServiceHttpClient({
        name: 'inventory-service',
        baseUrl,
        timeoutMs: 2500,
      });
  }
  async get(p: Principal, key: string): Promise<unknown> {
    if (this.client) {
      try {
        return await this.client.get(`/internal/inventory-operations/${key}`, {
          accessToken: p.accessToken,
        });
      } catch (error) {
        if (
          error instanceof UpstreamError &&
          error.status === 404 &&
          error.code === 'INVENTORY_NOT_FOUND'
        )
          throw reservationConflict();
        if (error instanceof UpstreamError && [401, 403].includes(error.status))
          throw new HttpException(
            {
              code: 'INVENTORY_PROOF_FORBIDDEN',
              message: 'Inventory did not authorize this caller',
            },
            error.status,
          );
      }
    }
    throw new ServiceUnavailableException({
      code: 'INVENTORY_PROOF_UNAVAILABLE',
      message: 'Inventory operation proof is unavailable',
    });
  }
}
