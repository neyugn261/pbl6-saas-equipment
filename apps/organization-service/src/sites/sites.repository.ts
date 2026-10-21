import { Injectable } from '@nestjs/common';
import {
  CustomerSite,
  Location,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';

export type LocationWithCustomer = Location & {
  customerSite: { customerId: string };
};

/**
 * Data access for customer sites and their location trees. A site is only
 * returned while it and its customer are live (not soft-deleted); the same
 * holds for a location and its site.
 */
@Injectable()
export class SitesRepository {
  constructor(private readonly prisma: PrismaService) {}

  listSites(tenantId: string, customerId: string): Promise<CustomerSite[]> {
    return this.prisma.customerSite.findMany({
      where: { tenantId, customerId, deletedAt: null },
      orderBy: { code: 'asc' },
    });
  }

  findSite(tenantId: string, id: string): Promise<CustomerSite | null> {
    return this.prisma.customerSite.findFirst({
      where: { id, tenantId, deletedAt: null, customer: { deletedAt: null } },
    });
  }

  createSite(data: Prisma.CustomerSiteUncheckedCreateInput): Promise<CustomerSite> {
    return this.prisma.customerSite.create({ data });
  }

  updateSite(
    id: string,
    data: Prisma.CustomerSiteUncheckedUpdateInput,
  ): Promise<CustomerSite> {
    return this.prisma.customerSite.update({ where: { id }, data });
  }

  listLocations(tenantId: string, siteId: string): Promise<Location[]> {
    return this.prisma.location.findMany({
      where: { tenantId, customerSiteId: siteId, deletedAt: null },
      orderBy: [{ parentId: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
    });
  }

  /** A live location whose site and customer are live too, with the site's customer. */
  findLocation(tenantId: string, id: string): Promise<LocationWithCustomer | null> {
    return this.prisma.location.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
        customerSite: { deletedAt: null, customer: { deletedAt: null } },
      },
      include: { customerSite: { select: { customerId: true } } },
    });
  }

  /**
   * Runs a change of one site's location tree with the site row locked, so
   * two concurrent moves cannot build a cycle together.
   */
  inLockedSite<T>(
    siteId: string,
    work: (tree: LocationTree) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customer_sites WHERE id = ${siteId}::uuid FOR UPDATE`;
      return work(new LocationTree(tx, siteId));
    });
  }
}

/** Location queries inside the transaction of `inLockedSite`. */
export class LocationTree {
  constructor(
    private readonly tx: Prisma.TransactionClient,
    readonly siteId: string,
  ) {}

  /** A live location of this site. */
  find(id: string): Promise<Location | null> {
    return this.tx.location.findFirst({
      where: { id, customerSiteId: this.siteId, deletedAt: null },
    });
  }

  hasLiveChildren(id: string): Promise<boolean> {
    return this.tx.location
      .count({ where: { parentId: id, customerSiteId: this.siteId, deletedAt: null } })
      .then((count) => count > 0);
  }

  create(data: Prisma.LocationUncheckedCreateInput): Promise<Location> {
    return this.tx.location.create({ data });
  }

  update(id: string, data: Prisma.LocationUncheckedUpdateInput): Promise<Location> {
    return this.tx.location.update({ where: { id }, data });
  }
}
