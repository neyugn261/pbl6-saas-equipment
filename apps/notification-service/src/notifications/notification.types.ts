export const NOTIFICATION_RESOURCE_TYPES = [
  'SERVICE_REQUEST',
  'WORK_ORDER',
  'EQUIPMENT',
  'STOCK',
] as const;

export type NotificationResourceType =
  (typeof NOTIFICATION_RESOURCE_TYPES)[number];

export interface NotificationResponse {
  id: string;
  eventType: string;
  title: string;
  body: string;
  resourceType: NotificationResourceType | null;
  resourceId: string | null;
  createdAt: Date;
  readAt: Date | null;
}
