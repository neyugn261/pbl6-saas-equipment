import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { isRoleCode, ROLE_USER_TYPES, type RoleCode } from '@pbl6/auth';
import { isUUID, isISO8601 } from 'class-validator';
import type { EventEnvelope } from '@pbl6/event-contracts';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEventsService } from './notification-events.service';

const RECIPIENT_CONSUMER = 'notification-service.recipient-snapshots';
const BOOTSTRAP_CONSUMER = 'notification-service.recipient-bootstrap';
const MAX_BIGINT = 9_223_372_036_854_775_807n;

interface MembershipSnapshot {
  membershipId: string;
  customerId: string;
  status: 'ACTIVE' | 'INACTIVE';
  sourceChangedAt: string;
}

interface RecipientSnapshotInput {
  userId: string;
  userType: 'TENANT_STAFF' | 'CUSTOMER';
  accountStatus: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  roles: string[];
  customerMembership: MembershipSnapshot | null;
  revision: string;
  bootstrapRunId: string | null;
}

interface BootstrapMarkerInput {
  bootstrapRunId: string;
  expectedUsers: number;
  startedAt: string;
  completedAt: string;
}

@Injectable()
export class RecipientProjectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: NotificationEventsService,
  ) {}

  async applySnapshot(envelope: EventEnvelope): Promise<void> {
    const snapshot = this.parseSnapshot(envelope);
    if (!snapshot || !envelope.tenantId) {
      throw new Error('Invalid Notification recipient snapshot');
    }
    const tenantId = envelope.tenantId;
    const revision = BigInt(snapshot.revision);
    const digest = this.snapshotInputHash(tenantId, snapshot);

    await this.prisma.$transaction(async (tx) => {
      const inserted = await this.insertInbox(
        tx,
        envelope,
        RECIPIENT_CONSUMER,
      );
      if (!inserted) {
        const current = await tx.recipientSnapshot.findUnique({
          where: { userId: snapshot.userId },
        });
        if (!current) {
          throw new Error('Recipient inbox row has no projection record');
        }
        if (
          current.tenantId === tenantId &&
          current.revision === revision &&
          this.snapshotHash(current) !== digest
        ) {
          await this.recordConflict(
            tx,
            envelope.eventId,
            envelope.eventType,
            this.snapshotHash(current),
            digest,
            RECIPIENT_CONSUMER,
          );
        }
        await this.events.reconcileTenant(tx, tenantId, true);
        return;
      }

      const membership = snapshot.customerMembership;
      const upserted = await tx.$queryRaw<Array<{ revision: bigint }>>`
        INSERT INTO recipient_snapshots (
          user_id, tenant_id, user_type, account_status, role_codes,
          membership_id, customer_id, membership_status,
          membership_source_changed_at, revision, bootstrap_run_id,
          source_occurred_at, updated_at
        )
        VALUES (
          ${snapshot.userId}::uuid,
          ${tenantId}::uuid,
          ${snapshot.userType},
          ${snapshot.accountStatus},
          ${JSON.stringify(snapshot.roles)}::jsonb,
          ${membership?.membershipId ?? null}::uuid,
          ${membership?.customerId ?? null}::uuid,
          ${membership?.status ?? null},
          ${membership ? new Date(membership.sourceChangedAt) : null},
          ${revision}::bigint,
          ${snapshot.bootstrapRunId}::uuid,
          ${new Date(envelope.occurredAt)},
          now()
        )
        ON CONFLICT (user_id) DO UPDATE SET
          user_type = EXCLUDED.user_type,
          account_status = EXCLUDED.account_status,
          role_codes = EXCLUDED.role_codes,
          membership_id = EXCLUDED.membership_id,
          customer_id = EXCLUDED.customer_id,
          membership_status = EXCLUDED.membership_status,
          membership_source_changed_at = EXCLUDED.membership_source_changed_at,
          revision = EXCLUDED.revision,
          bootstrap_run_id = EXCLUDED.bootstrap_run_id,
          source_occurred_at = EXCLUDED.source_occurred_at,
          updated_at = now()
        WHERE recipient_snapshots.tenant_id = EXCLUDED.tenant_id
          AND recipient_snapshots.revision < EXCLUDED.revision
        RETURNING revision
      `;
      let projectionConflict = false;

      if (upserted.length === 0) {
        const current = await tx.recipientSnapshot.findUnique({
          where: { userId: snapshot.userId },
        });
        if (!current) throw new Error('Recipient snapshot upsert was not applied');
        if (current.tenantId !== tenantId) {
          projectionConflict = true;
          await this.recordConflict(
            tx,
            envelope.eventId,
            envelope.eventType,
            this.snapshotHash(current),
            digest,
            RECIPIENT_CONSUMER,
          );
        } else if (
          current.revision === revision &&
          this.snapshotHash(current) !== digest
        ) {
          projectionConflict = true;
          await this.recordConflict(
            tx,
            envelope.eventId,
            envelope.eventType,
            this.snapshotHash(current),
            digest,
            RECIPIENT_CONSUMER,
          );
        }
      }

      if (snapshot.bootstrapRunId && !projectionConflict) {
        await this.recordBootstrapReceipt(
          tx,
          snapshot.bootstrapRunId,
          tenantId,
          snapshot.userId,
          revision,
        );
      }
      await this.events.reconcileTenant(tx, tenantId, true);
    });
  }

  async applyBootstrapCompleted(envelope: EventEnvelope): Promise<void> {
    const marker = this.parseBootstrapMarker(envelope);
    const tenantId = envelope.tenantId;
    if (!marker || !tenantId) {
      throw new Error('Invalid Notification recipient bootstrap marker');
    }

    await this.prisma.$transaction(async (tx) => {
      const inserted = await this.insertInbox(tx, envelope, BOOTSTRAP_CONSUMER);
      const existing = await tx.recipientBootstrapRun.findUnique({
        where: { bootstrapRunId: marker.bootstrapRunId },
      });
      if (existing && existing.tenantId !== tenantId) {
        await this.recordConflict(
          tx,
          envelope.eventId,
          envelope.eventType,
          this.hash({ tenantId: existing.tenantId, runId: marker.bootstrapRunId }),
          this.hash({ tenantId, ...marker }),
          BOOTSTRAP_CONSUMER,
        );
        return;
      }
      if (existing?.markerReceived) {
        const sameMarker =
          existing.expectedUsers === marker.expectedUsers &&
          existing.startedAt?.toISOString() === marker.startedAt &&
          existing.completedAt?.toISOString() === marker.completedAt;
        if (!sameMarker) {
          await this.recordConflict(
            tx,
            envelope.eventId,
            envelope.eventType,
            this.hash({
              expectedUsers: existing.expectedUsers,
              startedAt: existing.startedAt?.toISOString(),
              completedAt: existing.completedAt?.toISOString(),
            }),
            this.hash(marker),
            BOOTSTRAP_CONSUMER,
          );
        }
        await this.events.reconcileTenant(tx, tenantId, true);
        return;
      }
      if (!inserted && !existing) {
        throw new Error('Bootstrap inbox row has no durable run record');
      }

      if (!existing) {
        await tx.recipientBootstrapRun.create({
          data: {
            bootstrapRunId: marker.bootstrapRunId,
            tenantId,
            status: 'RUNNING',
          },
        });
      }
      await tx.$queryRaw`
        SELECT bootstrap_run_id
        FROM recipient_bootstrap_runs
        WHERE bootstrap_run_id = ${marker.bootstrapRunId}::uuid
          AND tenant_id = ${tenantId}::uuid
        FOR UPDATE
      `;
      const currentRun = await tx.recipientBootstrapRun.findUnique({
        where: { bootstrapRunId: marker.bootstrapRunId },
      });
      if (!currentRun || currentRun.tenantId !== tenantId) {
        throw new Error('Bootstrap run disappeared during marker processing');
      }
      if (currentRun.markerReceived) {
        const sameMarker =
          currentRun.expectedUsers === marker.expectedUsers &&
          currentRun.startedAt?.toISOString() === marker.startedAt &&
          currentRun.completedAt?.toISOString() === marker.completedAt;
        if (!sameMarker) {
          await this.recordConflict(
            tx,
            envelope.eventId,
            envelope.eventType,
            this.hash({
              expectedUsers: currentRun.expectedUsers,
              startedAt: currentRun.startedAt?.toISOString(),
              completedAt: currentRun.completedAt?.toISOString(),
            }),
            this.hash(marker),
            BOOTSTRAP_CONSUMER,
          );
        }
        await this.events.reconcileTenant(tx, tenantId, true);
        return;
      }
      const [receiptCount] = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM recipient_bootstrap_receipts
        WHERE bootstrap_run_id = ${marker.bootstrapRunId}::uuid
          AND tenant_id = ${tenantId}::uuid
      `;
      if ((receiptCount?.count ?? 0n) > 2_147_483_647n) {
        throw new Error('Bootstrap receipt count exceeds the supported range');
      }
      const receivedUsers = Number(receiptCount?.count ?? 0n);
      const status =
        receivedUsers === marker.expectedUsers
          ? 'COMPLETED'
          : receivedUsers > marker.expectedUsers
            ? 'FAILED'
            : 'RUNNING';
      await tx.recipientBootstrapRun.upsert({
        where: { bootstrapRunId: marker.bootstrapRunId },
        create: {
          bootstrapRunId: marker.bootstrapRunId,
          tenantId,
          expectedUsers: marker.expectedUsers,
          receivedUsers,
          markerReceived: true,
          status,
          startedAt: new Date(marker.startedAt),
          completedAt: status === 'COMPLETED' ? new Date(marker.completedAt) : null,
        },
        update: {
          expectedUsers: marker.expectedUsers,
          receivedUsers,
          markerReceived: true,
          status,
          startedAt: new Date(marker.startedAt),
          completedAt: status === 'COMPLETED' ? new Date(marker.completedAt) : null,
        },
      });
      await this.events.reconcileTenant(tx, tenantId, true);
    });
  }

  private async recordBootstrapReceipt(
    tx: Prisma.TransactionClient,
    bootstrapRunId: string,
    tenantId: string,
    userId: string,
    revision: bigint,
  ): Promise<void> {
    let run = await tx.recipientBootstrapRun.findUnique({
      where: { bootstrapRunId },
    });
    if (!run) {
      await tx.recipientBootstrapRun.create({
        data: {
          bootstrapRunId,
          tenantId,
          status: 'RUNNING',
        },
      });
      run = await tx.recipientBootstrapRun.findUnique({
        where: { bootstrapRunId },
      });
    }
    if (!run) throw new Error('Bootstrap run could not be created');
    if (run.tenantId !== tenantId) {
      await this.recordConflict(
        tx,
        bootstrapRunId,
        'NotificationRecipientSnapshot.v1',
        this.hash({ tenantId: run.tenantId }),
        this.hash({ tenantId }),
        RECIPIENT_CONSUMER,
      );
      return;
    }
    await tx.$queryRaw`
      SELECT bootstrap_run_id
      FROM recipient_bootstrap_runs
      WHERE bootstrap_run_id = ${bootstrapRunId}::uuid
        AND tenant_id = ${tenantId}::uuid
      FOR UPDATE
    `;
    run = await tx.recipientBootstrapRun.findUnique({
      where: { bootstrapRunId },
    });
    if (!run || run.tenantId !== tenantId) {
      throw new Error('Bootstrap run disappeared during snapshot receipt');
    }

    const inserted = await tx.recipientBootstrapReceipt.createMany({
      data: [{ bootstrapRunId, tenantId, userId, appliedRevision: revision }],
      skipDuplicates: true,
    });
    if (inserted.count === 0) {
      await tx.recipientBootstrapReceipt.updateMany({
        where: {
          bootstrapRunId,
          userId,
          tenantId,
          appliedRevision: { lt: revision },
        },
        data: { appliedRevision: revision },
      });
    }

    const receivedUsers = await tx.recipientBootstrapReceipt.count({
      where: { bootstrapRunId, tenantId },
    });
    if (receivedUsers > 2_147_483_647) {
      throw new Error('Bootstrap receipt count exceeds the supported range');
    }
    const status =
      run.expectedUsers === null
        ? 'RUNNING'
        : receivedUsers === run.expectedUsers && run.markerReceived
          ? 'COMPLETED'
          : receivedUsers > run.expectedUsers
            ? 'FAILED'
            : 'RUNNING';
    await tx.recipientBootstrapRun.update({
      where: { bootstrapRunId },
      data: {
        receivedUsers,
        status,
        ...(status === 'COMPLETED' && run.completedAt === null
          ? { completedAt: new Date() }
          : {}),
      },
    });
  }

  private async insertInbox(
    tx: Prisma.TransactionClient,
    envelope: EventEnvelope,
    consumer: string,
  ): Promise<boolean> {
    const inserted = await tx.$executeRaw`
      INSERT INTO processed_events (event_id, consumer, event_type)
      VALUES (
        ${envelope.eventId}::uuid,
        ${consumer},
        ${`${envelope.eventType}.v${envelope.eventVersion}`}
      )
      ON CONFLICT (event_id, consumer) DO NOTHING
    `;
    return inserted > 0;
  }

  private async recordConflict(
    tx: Prisma.TransactionClient,
    sourceEventId: string,
    eventType: string,
    expectedSha256: string,
    observedSha256: string,
    consumer: string,
  ): Promise<void> {
    await tx.notificationEventConflict.createMany({
      data: [
        {
          sourceEventId,
          consumer,
          eventType,
          expectedSha256,
          observedSha256,
        },
      ],
      skipDuplicates: true,
    });
  }

  private parseSnapshot(
    envelope: EventEnvelope,
  ): RecipientSnapshotInput | undefined {
    if (
      envelope.eventType !== 'NotificationRecipientSnapshot' ||
      envelope.eventVersion !== 1 ||
      envelope.producer !== 'identity-service' ||
      envelope.aggregateType !== 'User' ||
      !isUUID(envelope.eventId) ||
      !envelope.tenantId ||
      !isUUID(envelope.tenantId) ||
      !isUUID(envelope.aggregateId) ||
      !isISO8601(envelope.occurredAt)
    ) {
      return undefined;
    }
    const payload = this.record(envelope.payload);
    if (
      !payload ||
      !this.onlyKeys(payload, [
        'userId',
        'userType',
        'accountStatus',
        'roles',
        'customerMembership',
        'revision',
        'bootstrapRunId',
      ])
    ) {
      return undefined;
    }
    const userId = payload.userId;
    const userType = payload.userType;
    const accountStatus = payload.accountStatus;
    const roles = this.parseRoles(payload.roles);
    const revision = payload.revision;
    const bootstrapRunId = payload.bootstrapRunId;
    const membership = this.parseMembership(payload.customerMembership);
    if (
      typeof userId !== 'string' ||
      !isUUID(userId) ||
      userId !== envelope.aggregateId ||
      typeof userType !== 'string' ||
      !['TENANT_STAFF', 'CUSTOMER'].includes(userType) ||
      typeof accountStatus !== 'string' ||
      !['INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED'].includes(accountStatus) ||
      !roles ||
      roles.some((role, index) => index > 0 && roles[index - 1] >= role) ||
      typeof revision !== 'string' ||
      !/^[1-9]\d*$/.test(revision) ||
      revision.length > 19 ||
      BigInt(revision) > MAX_BIGINT ||
      (bootstrapRunId !== null &&
        (typeof bootstrapRunId !== 'string' || !isUUID(bootstrapRunId))) ||
      membership === undefined ||
      roles.some((role) => ROLE_USER_TYPES[role] !== userType) ||
      (userType === 'TENANT_STAFF' && membership !== null)
    ) {
      return undefined;
    }
    return {
      userId,
      userType: userType as RecipientSnapshotInput['userType'],
      accountStatus: accountStatus as RecipientSnapshotInput['accountStatus'],
      roles,
      customerMembership: membership,
      revision,
      bootstrapRunId,
    };
  }

  private parseMembership(value: unknown): MembershipSnapshot | null | undefined {
    if (value === null) return null;
    const membership = this.record(value);
    if (
      !membership ||
      !this.onlyKeys(membership, [
        'membershipId',
        'customerId',
        'status',
        'sourceChangedAt',
      ]) ||
      typeof membership.membershipId !== 'string' ||
      !isUUID(membership.membershipId) ||
      typeof membership.customerId !== 'string' ||
      !isUUID(membership.customerId) ||
      typeof membership.status !== 'string' ||
      !['ACTIVE', 'INACTIVE'].includes(membership.status) ||
      typeof membership.sourceChangedAt !== 'string' ||
      !isISO8601(membership.sourceChangedAt)
    ) {
      return undefined;
    }
    return {
      membershipId: membership.membershipId,
      customerId: membership.customerId,
      status: membership.status as MembershipSnapshot['status'],
      sourceChangedAt: membership.sourceChangedAt,
    };
  }

  private parseBootstrapMarker(
    envelope: EventEnvelope,
  ): BootstrapMarkerInput | undefined {
    if (
      envelope.eventType !== 'NotificationRecipientBootstrapCompleted' ||
      envelope.eventVersion !== 1 ||
      envelope.producer !== 'identity-service' ||
      !isUUID(envelope.eventId) ||
      !envelope.tenantId ||
      !isUUID(envelope.tenantId) ||
      envelope.aggregateType !== 'Tenant' ||
      envelope.aggregateId !== envelope.tenantId ||
      !isISO8601(envelope.occurredAt)
    ) {
      return undefined;
    }
    const payload = this.record(envelope.payload);
    if (
      !payload ||
      !this.onlyKeys(payload, [
        'bootstrapRunId',
        'expectedUsers',
        'startedAt',
        'completedAt',
      ]) ||
      typeof payload.bootstrapRunId !== 'string' ||
      !isUUID(payload.bootstrapRunId) ||
      !Number.isSafeInteger(payload.expectedUsers) ||
      typeof payload.expectedUsers !== 'number' ||
      payload.expectedUsers < 0 ||
      payload.expectedUsers > 2_147_483_647 ||
      typeof payload.startedAt !== 'string' ||
      !isISO8601(payload.startedAt) ||
      typeof payload.completedAt !== 'string' ||
      !isISO8601(payload.completedAt) ||
      Date.parse(payload.completedAt) < Date.parse(payload.startedAt)
    ) {
      return undefined;
    }
    return {
      bootstrapRunId: payload.bootstrapRunId,
      expectedUsers: payload.expectedUsers,
      startedAt: payload.startedAt,
      completedAt: payload.completedAt,
    };
  }

  private snapshotHash(
    snapshot: {
      userId: string;
      tenantId: string;
      userType: string;
      accountStatus: string;
      roleCodes: Prisma.JsonValue;
      membershipId: string | null;
      customerId: string | null;
      membershipStatus: string | null;
      membershipSourceChangedAt: Date | null;
      revision: bigint;
    },
  ): string {
    return this.hash({
      tenantId: snapshot.tenantId,
      userId: snapshot.userId,
      userType: snapshot.userType,
      accountStatus: snapshot.accountStatus,
      roles: snapshot.roleCodes,
      customerMembership: snapshot.membershipId
        ? {
            membershipId: snapshot.membershipId,
            customerId: snapshot.customerId,
            status: snapshot.membershipStatus,
            sourceChangedAt:
              snapshot.membershipSourceChangedAt?.toISOString() ?? null,
          }
        : null,
      revision: snapshot.revision.toString(),
    });
  }

  private snapshotInputHash(
    tenantId: string,
    snapshot: RecipientSnapshotInput,
  ): string {
    return this.hash({
      tenantId,
      userId: snapshot.userId,
      userType: snapshot.userType,
      accountStatus: snapshot.accountStatus,
      roles: snapshot.roles,
      customerMembership: snapshot.customerMembership
        ? {
            ...snapshot.customerMembership,
            sourceChangedAt: new Date(
              snapshot.customerMembership.sourceChangedAt,
            ).toISOString(),
          }
        : null,
      revision: snapshot.revision,
    });
  }

  private record(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private parseRoles(value: unknown): RoleCode[] | undefined {
    if (!Array.isArray(value) || !value.every(isRoleCode)) return undefined;
    return value;
  }

  private onlyKeys(
    value: Record<string, unknown>,
    allowed: string[],
  ): boolean {
    return Object.keys(value).every((key) => allowed.includes(key));
  }

  private hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
