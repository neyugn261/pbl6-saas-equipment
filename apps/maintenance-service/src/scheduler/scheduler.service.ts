import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { enqueueEvent, Events } from '@pbl6/event-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { changes, recordHistory } from '../common/audit';
import {
  calendarDate,
  dateText,
  dueWindow,
  vietnamToday,
  type FrequencyUnit,
} from '../common/calendar';
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<number>;
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
  ) {}
  onModuleInit() {
    if (this.config.get<string>('MAINTENANCE_SCHEDULER_ENABLED') !== 'true')
      return;
    this.timer = setInterval(
      () => this.runBackground(),
      this.config.getOrThrow<number>('MAINTENANCE_SCHEDULER_INTERVAL_MS'),
    );
    this.timer.unref();
    this.runBackground();
  }
  private runBackground() {
    if (this.running) return;
    this.running = this.tick()
      .catch((error: unknown) => {
        this.logger.error({
          msg: 'Maintenance tick failed',
          error: error instanceof Error ? error.message : 'unknown',
        });
        return 0;
      })
      .finally(() => {
        this.running = undefined;
      });
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  async tick(
    todayText = vietnamToday(),
    tenantId: string | null = null,
  ): Promise<number> {
    const today = calendarDate(todayText);
    return this.db.$transaction(
      async (tx) => {
        const plans = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM maintenance_plans WHERE status = 'ACTIVE' AND next_due_date <= ${today}::date
        AND (${tenantId}::uuid IS NULL OR tenant_id = ${tenantId}::uuid)
        ORDER BY next_due_date, id LIMIT 100 FOR UPDATE SKIP LOCKED`;
        let created = 0;
        for (const { id } of plans) {
          const plan = await tx.maintenancePlan.findUniqueOrThrow({
            where: { id },
          });
          const snapshot = await tx.equipmentSnapshot.findUnique({
            where: {
              tenantId_equipmentId: {
                tenantId: plan.tenantId,
                equipmentId: plan.equipmentId,
              },
            },
          });
          if (snapshot && snapshot.snapshotVersion > plan.snapshotVersion) {
            this.logger.warn({
              msg: 'Skipped plan with stale snapshot',
              planId: id,
            });
            continue;
          }
          const window = dueWindow(
            plan.anchorDate,
            plan.frequencyUnit as FrequencyUnit,
            plan.frequencyValue,
            today,
          );
          if (!window) continue;
          const previous = await tx.maintenanceTask.findUnique({
            where: {
              maintenancePlanId_scheduledDate: {
                maintenancePlanId: id,
                scheduledDate: window.scheduledDate,
              },
            },
          });
          if (!previous) {
            const task = await tx.maintenanceTask.create({
              data: {
                tenantId: plan.tenantId,
                maintenancePlanId: id,
                scheduledDate: window.scheduledDate,
                customerId: plan.customerId,
                customerSiteId: plan.customerSiteId,
                attemptCount: 1,
              },
            });
            await enqueueEvent(tx, Events.MaintenanceTaskDue, {
              tenantId: plan.tenantId,
              aggregateId: task.id,
              payload: {
                maintenanceTaskId: task.id,
                maintenancePlanId: id,
                equipmentId: plan.equipmentId,
                customerId: task.customerId,
                customerSiteId: task.customerSiteId,
                scheduledDate: dateText(task.scheduledDate),
                title: plan.name,
              },
            });
            await recordHistory(
              tx,
              plan,
              'TASK_GENERATED',
              changes(
                {},
                {
                  scheduledDate: dateText(task.scheduledDate),
                  status: task.status,
                  workOrderId: null,
                },
              ),
              { taskId: task.id },
            );
            created++;
          }
          await tx.maintenancePlan.update({
            where: { id },
            data: { nextDueDate: window.nextDueDate },
          });
          await recordHistory(
            tx,
            plan,
            'SCHEDULE_ADVANCED',
            changes(
              { nextDueDate: dateText(plan.nextDueDate) },
              { nextDueDate: dateText(window.nextDueDate) },
            ),
          );
        }
        return created;
      },
      { timeout: 30000 },
    );
  }
}
