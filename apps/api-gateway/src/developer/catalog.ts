import type { AppEnv } from '../config/env.validation.js';

export interface DeveloperService {
  id: string;
  name: string;
  setting: keyof AppEnv;
  apiPrefix: string;
  serverBase: string;
  stage: string;
  spec?: string;
  interactive: boolean;
}

/** Implementation status on develop; update with a service's implementation PR. */
export const DEVELOPER_SERVICES: readonly DeveloperService[] = [
  {
    id: 'identity',
    name: 'Identity',
    setting: 'IDENTITY_SERVICE_URL',
    apiPrefix: '/api/identity',
    serverBase: '/api/identity',
    stage: 'Auth, người dùng, RBAC',
    spec: 'identity.yaml',
    interactive: true,
  },
  {
    id: 'organization',
    name: 'Organization',
    setting: 'ORGANIZATION_SERVICE_URL',
    apiPrefix: '/api/organization',
    serverBase: '/api/organization',
    stage: 'Tenant, chi nhánh, khách hàng',
    spec: 'organization.yaml',
    interactive: true,
  },
  {
    id: 'asset',
    name: 'Asset',
    setting: 'ASSET_SERVICE_URL',
    apiPrefix: '/api/assets',
    serverBase: '/api/assets',
    stage: 'Thiết bị, bảo hành, QR',
    spec: 'asset.yaml',
    interactive: true,
  },
  {
    id: 'service-request',
    name: 'Service Request',
    setting: 'SERVICE_REQUEST_SERVICE_URL',
    apiPrefix: '/api/service-requests',
    serverBase: '/api',
    stage: 'SR, kết quả WO và Cost Estimate',
    spec: 'service-request.yaml',
    interactive: true,
  },
  {
    id: 'workorder',
    name: 'Work Order',
    setting: 'WORKORDER_SERVICE_URL',
    apiPrefix: '/api/workorders',
    serverBase: '/api/workorders',
    stage: 'WO, Technician, thực thi, báo cáo và replacement K6',
    spec: 'workorder.yaml',
    interactive: true,
  },
  {
    id: 'maintenance',
    name: 'Maintenance',
    setting: 'MAINTENANCE_SERVICE_URL',
    apiPrefix: '/api/maintenance',
    serverBase: '/api/maintenance',
    stage: 'Kế hoạch, task bảo trì và yêu cầu replacement',
    spec: 'maintenance.yaml',
    interactive: true,
  },
  {
    id: 'inventory',
    name: 'Inventory',
    setting: 'INVENTORY_SERVICE_URL',
    apiPrefix: '/api/inventory',
    serverBase: '/api/inventory',
    stage: 'Scaffold — chưa có API nghiệp vụ',
    spec: 'inventory.yaml',
    interactive: false,
  },
  {
    id: 'notification',
    name: 'Notification',
    setting: 'NOTIFICATION_SERVICE_URL',
    apiPrefix: '/api/notifications',
    serverBase: '/api/notifications',
    stage: 'Scaffold — chưa có API nghiệp vụ',
    spec: 'notification.yaml',
    interactive: false,
  },
];
