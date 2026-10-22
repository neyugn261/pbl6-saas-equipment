import { Injectable } from '@nestjs/common';
import type { DataScope } from '@pbl6/auth';
import { conflict, notFound, unprocessable } from '../common/errors';
import { assertCustomerVisible } from '../common/scope';
import type { Location } from '../generated/prisma/client.js';
import type { CreateLocationDto, UpdateLocationDto } from './dto/location.dto';
import { createsCycle } from './location-cycle';
import { type LocationResponse, toLocationResponse } from './site.response';
import { type LocationTree, SitesRepository } from './sites.repository';
import { SitesService } from './sites.service';

@Injectable()
export class LocationsService {
  constructor(
    private readonly sites: SitesService,
    private readonly repository: SitesRepository,
  ) {}

  /** The whole tree of a site as a flat list (parents before children of the same level). */
  async list(scope: DataScope, siteId: string): Promise<LocationResponse[]> {
    await this.sites.load(scope, siteId);
    const locations = await this.repository.listLocations(scope.tenantId, siteId);
    return locations.map(toLocationResponse);
  }

  async create(
    scope: DataScope,
    siteId: string,
    input: CreateLocationDto,
  ): Promise<LocationResponse> {
    const site = await this.sites.load(scope, siteId);
    const location = await this.repository.inLockedSite(site.id, async (tree) => {
      if (input.parentId) await this.assertParent(tree, input.parentId);
      return tree.create({ ...input, tenantId: scope.tenantId, customerSiteId: site.id });
    });
    return toLocationResponse(location);
  }

  async update(
    scope: DataScope,
    id: string,
    input: UpdateLocationDto,
  ): Promise<LocationResponse> {
    const current = await this.load(scope, id);
    const location = await this.repository.inLockedSite(
      current.customerSiteId,
      async (tree) => {
        if (input.parentId) {
          await this.assertParent(tree, input.parentId);
          const cycle = await createsCycle(id, input.parentId, async (locationId) =>
            (await tree.find(locationId))?.parentId ?? null,
          );
          if (cycle) {
            throw unprocessable(
              'LOCATION_CYCLE',
              'A location cannot be moved under itself or one of its descendants',
            );
          }
        }
        return tree.update(id, input);
      },
    );
    return toLocationResponse(location);
  }

  async remove(scope: DataScope, id: string): Promise<void> {
    const location = await this.load(scope, id);
    await this.repository.inLockedSite(location.customerSiteId, async (tree) => {
      if (await tree.hasLiveChildren(id)) {
        throw conflict(
          'LOCATION_HAS_CHILDREN',
          'Delete or move the child locations first',
        );
      }
      await tree.update(id, { deletedAt: new Date() });
    });
  }

  private async load(scope: DataScope, id: string): Promise<Location> {
    const location = await this.repository.findLocation(scope.tenantId, id);
    if (!location) throw notFound('LOCATION_NOT_FOUND', 'Location not found');
    assertCustomerVisible(scope, location.customerSite.customerId, 'LOCATION_NOT_FOUND');
    return location;
  }

  private async assertParent(tree: LocationTree, parentId: string): Promise<void> {
    if (!(await tree.find(parentId))) {
      throw unprocessable(
        'PARENT_NOT_IN_SITE',
        'The parent location must be a location of the same site',
      );
    }
  }
}
