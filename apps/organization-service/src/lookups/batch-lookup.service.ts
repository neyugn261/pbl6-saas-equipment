import { BadRequestException, Injectable } from '@nestjs/common';
import type { DataScope } from '@pbl6/auth';
import { CustomersRepository } from '../customers/customers.repository';
import { SitesRepository } from '../sites/sites.repository';
import type { BatchLookupDto } from './batch-lookup.dto';

@Injectable()
export class BatchLookupService {
  constructor(
    private readonly customers: CustomersRepository,
    private readonly sites: SitesRepository,
  ) {}

  async lookup(scope: DataScope, input: BatchLookupDto) {
    if (
      !(input.customerCodes?.length) &&
      !(input.sites?.length) &&
      !(input.locations?.length) &&
      !(input.contacts?.length)
    ) {
      throw new BadRequestException({
        code: 'LOOKUP_REQUIRED',
        message: 'Provide at least one lookup collection',
      });
    }

    const customerCodes = [
      ...new Set([
        ...(input.customerCodes ?? []),
        ...(input.sites ?? []).map((site) => site.customerCode),
        ...(input.locations ?? []).map((location) => location.customerCode),
        ...(input.contacts ?? []).map((contact) => contact.customerCode),
      ]),
    ];
    const customers = customerCodes.length
      ? await this.customers.lookupByCodes(
          scope.tenantId,
          scope.customerId,
          customerCodes,
        )
      : [];
    const customerIdByCode = new Map(
      customers.map((customer) => [customer.code, customer.id]),
    );

    const siteInputs = [
      ...(input.sites ?? []),
      ...(input.locations ?? []).map((location) => ({
        customerCode: location.customerCode,
        code: location.code,
      })),
    ];
    const siteReferences = siteInputs
      .map((site) => ({
        customerCode: site.customerCode,
        customerId: customerIdByCode.get(site.customerCode),
        code: site.code,
      }))
      .filter(
        (site): site is typeof site & { customerId: string } =>
          site.customerId !== undefined,
      );
    const sites = siteReferences.length
      ? await this.sites.lookupByCodes(scope.tenantId, siteReferences)
      : [];
    const siteByReference = new Map(
      sites.map((site) => [
        `${site.customerId}\u0000${site.code}`,
        site,
      ]),
    );

    const locationReferences = (input.locations ?? [])
      .map((location) => {
        const customerId = customerIdByCode.get(location.customerCode);
        const site = customerId
          ? siteByReference.get(`${customerId}\u0000${location.code}`)
          : undefined;
        return {
          customerCode: location.customerCode,
          customerId,
          site,
          code: location.locationCode,
        };
      })
      .filter(
        (
          location,
        ): location is typeof location & {
          customerId: string;
          site: NonNullable<typeof location.site>;
        } => Boolean(location.customerId && location.site),
      );
    const matchedLocations = locationReferences.length
      ? await this.sites.lookupLocations(
          scope.tenantId,
          locationReferences.map((location) => ({
            customerSiteId: location.site.id,
            code: location.code,
          })),
        )
      : [];
    const locationPaths = await this.locationPaths(
      scope.tenantId,
      matchedLocations,
    );

    const contactReferences = (input.contacts ?? [])
      .map((contact) => ({
        customerCode: contact.customerCode,
        customerId: customerIdByCode.get(contact.customerCode),
        code: contact.code,
      }))
      .filter(
        (contact): contact is typeof contact & { customerId: string } =>
          contact.customerId !== undefined,
      );
    const contacts = contactReferences.length
      ? await this.customers.lookupContacts(
          scope.tenantId,
          scope.customerId,
          contactReferences,
        )
      : [];

    return {
      customers,
      sites: sites.map((site) => ({
        ...site,
        customerCode: site.customer.code,
        customerName: site.customer.name,
        customerAddress: site.customer.address,
        servicingBranch: site.defaultServicingBranch,
      })),
      locations: matchedLocations.map((location) => ({
        ...location,
        customerCode: location.customerSite.customer.code,
        customerAddress: location.customerSite.customer.address,
        siteCode: location.customerSite.code,
        siteAddress: location.customerSite.address,
        defaultServicingBranchId:
          location.customerSite.defaultServicingBranchId,
        locationPath: locationPaths.get(location.id) ?? [],
      })),
      contacts,
    };
  }

  private async locationPaths(
    tenantId: string,
    matches: Awaited<ReturnType<SitesRepository['lookupLocations']>>,
  ): Promise<Map<string, Array<{ code: string | null; name: string }>>> {
    const rows = new Map(
      matches.map((location) => [
        location.id,
        {
          id: location.id,
          parentId: location.parentId,
          code: location.code,
          name: location.name,
          customerSiteId: location.customerSiteId,
        },
      ]),
    );
    let parents = [...new Set(matches.map((location) => location.parentId).filter(
      (id): id is string => id !== null,
    ))];
    while (parents.length > 0) {
      const missing = parents.filter((id) => !rows.has(id));
      if (missing.length === 0) break;
      const ancestors = await this.sites.locationPathRows(
        tenantId,
        [...new Set(matches.map((location) => location.customerSiteId))],
        missing,
      );
      for (const ancestor of ancestors) rows.set(ancestor.id, ancestor);
      parents = ancestors
        .map((ancestor) => ancestor.parentId)
        .filter((id): id is string => id !== null);
    }

    const paths = new Map<
      string,
      Array<{ code: string | null; name: string }>
    >();
    for (const match of matches) {
      const path: Array<{ code: string | null; name: string }> = [];
      let current = rows.get(match.id);
      const seen = new Set<string>();
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        path.unshift({ code: current.code, name: current.name });
        current = current.parentId ? rows.get(current.parentId) : undefined;
      }
      paths.set(match.id, path);
    }
    return paths;
  }
}
