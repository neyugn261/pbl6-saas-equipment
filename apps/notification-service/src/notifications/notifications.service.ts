import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Principal } from '@pbl6/auth';
import { toPage, toSkipTake, type Page } from '@pbl6/service-kit';
import { Prisma, type Notification } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationReadStatus,
  type NotificationQueryDto,
} from './notification-query.dto';
import {
  NOTIFICATION_RESOURCE_TYPES,
  type NotificationResourceType,
  type NotificationResponse,
} from './notification.types';

type NotificationScope = Prisma.NotificationWhereInput;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    principal: Principal,
    query: NotificationQueryDto,
  ): Promise<Page<NotificationResponse>> {
    const scope = await this.scopeFor(principal);
    const dateFilter = this.dateFilter(query.createdFrom, query.createdTo);
    const where: NotificationScope = {
      ...scope,
      ...(query.readStatus === NotificationReadStatus.READ
        ? { readAt: { not: null } }
        : query.readStatus === NotificationReadStatus.UNREAD
          ? { readAt: null }
          : {}),
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    };
    const { skip, take } = toSkipTake(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return toPage(
      rows.map((row) => this.toResponse(row)),
      total,
      query,
    );
  }

  async unreadCount(principal: Principal): Promise<{ unreadCount: number }> {
    const scope = await this.scopeFor(principal);
    const unreadCount = await this.prisma.notification.count({
      where: { ...scope, readAt: null },
    });
    return { unreadCount };
  }

  async markRead(
    principal: Principal,
    notificationId: string,
  ): Promise<NotificationResponse> {
    const scope = await this.scopeFor(principal);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.notification.findFirst({
        where: { ...scope, id: notificationId },
      });
      if (!current) {
        throw this.notFound();
      }
      if (current.readAt === null) {
        await tx.notification.updateMany({
          where: { ...scope, id: notificationId, readAt: null },
          data: { readAt: new Date() },
        });
      }
      const updated = await tx.notification.findFirst({
        where: { ...scope, id: notificationId },
      });
      if (!updated) {
        throw this.notFound();
      }
      return this.toResponse(updated);
    });
  }

  private async scopeFor(principal: Principal): Promise<NotificationScope> {
    if (
      principal.userType === 'PLATFORM_STAFF' ||
      !principal.tenantId ||
      (principal.userType !== 'TENANT_STAFF' &&
        principal.userType !== 'CUSTOMER')
    ) {
      throw this.forbidden();
    }

    const snapshot = await this.prisma.recipientSnapshot.findUnique({
      where: { userId: principal.userId },
    });
    const snapshotRoles = this.stringArray(snapshot?.roleCodes);
    if (
      !snapshot ||
      snapshot.tenantId !== principal.tenantId ||
      snapshot.userType !== principal.userType ||
      snapshot.accountStatus !== 'ACTIVE' ||
      !principal.roles.every((role) => snapshotRoles.includes(role))
    ) {
      throw this.forbidden();
    }

    if (principal.userType === 'CUSTOMER') {
      if (
        !principal.customerId ||
        snapshot.membershipStatus !== 'ACTIVE' ||
        snapshot.customerId !== principal.customerId ||
        !snapshot.membershipId ||
        !snapshot.membershipSourceChangedAt
      ) {
        throw this.forbidden();
      }
      return {
        tenantId: principal.tenantId,
        userId: principal.userId,
        channel: 'IN_APP',
        customerId: principal.customerId,
      };
    }

    if (
      snapshot.customerId !== null ||
      snapshot.membershipId !== null ||
      snapshot.membershipStatus !== null
    ) {
      throw this.forbidden();
    }
    return {
      tenantId: principal.tenantId,
      userId: principal.userId,
      channel: 'IN_APP',
      customerId: null,
    };
  }

  private dateFilter(
    from?: string,
    to?: string,
  ): Prisma.NotificationWhereInput['createdAt'] {
    const gte = from ? new Date(from) : undefined;
    const lte = to ? new Date(to) : undefined;
    if (
      (gte && !Number.isFinite(gte.getTime())) ||
      (lte && !Number.isFinite(lte.getTime())) ||
      (gte && lte && gte > lte)
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'createdFrom must be earlier than or equal to createdTo',
      });
    }
    if (!gte && !lte) return undefined;
    return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
  }

  private toResponse(row: Notification): NotificationResponse {
    if (!row.type || !row.title) {
      throw new InternalServerErrorException({
        code: 'NOTIFICATION_DATA_INVALID',
        message: 'Notification data is invalid',
      });
    }
    const resource = this.resourceFields(row.payload);
    return {
      id: row.id,
      eventType: row.type,
      title: row.title,
      body: row.content,
      ...resource,
      createdAt: row.createdAt,
      readAt: row.readAt,
    };
  }

  private resourceFields(
    payload: Prisma.JsonValue | null,
  ): Pick<NotificationResponse, 'resourceType' | 'resourceId'> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { resourceType: null, resourceId: null };
    }
    const rawType = payload.resourceType;
    const rawId = payload.resourceId;
    if (
      (rawType === undefined && rawId === undefined) ||
      (rawType === null && rawId === null)
    ) {
      return { resourceType: null, resourceId: null };
    }
    if (
      typeof rawType !== 'string' ||
      !this.isResourceType(rawType) ||
      typeof rawId !== 'string' ||
      !isUUID(rawId)
    ) {
      throw new InternalServerErrorException({
        code: 'NOTIFICATION_DATA_INVALID',
        message: 'Notification data is invalid',
      });
    }
    return { resourceType: rawType, resourceId: rawId };
  }

  private isResourceType(value: string): value is NotificationResourceType {
    return (NOTIFICATION_RESOURCE_TYPES as readonly string[]).includes(value);
  }

  private stringArray(value: Prisma.JsonValue | undefined): string[] {
    if (
      !Array.isArray(value) ||
      !value.every((item): item is string => typeof item === 'string')
    ) {
      return [];
    }
    return value;
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Forbidden',
    });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'NOT_FOUND',
      message: 'Notification not found',
    });
  }
}
