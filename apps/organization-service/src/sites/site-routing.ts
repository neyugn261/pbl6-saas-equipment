import { enqueueEvent, Events } from '@pbl6/event-contracts';
import type { CustomerSite, Prisma } from '../generated/prisma/client.js';

/** Call inside the same transaction as the site's routing version change. */
export async function enqueueSiteRouting(
  tx: Prisma.TransactionClient,
  site: CustomerSite,
) {
  const branch = site.defaultServicingBranchId
    ? await tx.branch.findFirst({
        where: {
          id: site.defaultServicingBranchId,
          tenantId: site.tenantId,
          status: 'ACTIVE',
          deletedAt: null,
        },
      })
    : null;
  const customer = await tx.customer.findFirst({
    where: { id: site.customerId, tenantId: site.tenantId, deletedAt: null },
  });
  await enqueueEvent(tx, Events.CustomerSiteRoutingChanged, {
    tenantId: site.tenantId,
    aggregateId: site.id,
    payload: {
      siteId: site.id,
      branchId:
        !site.deletedAt && site.status === 'ACTIVE' && customer
          ? (branch?.id ?? null)
          : null,
      revision: site.routingVersion,
    },
  });
}
