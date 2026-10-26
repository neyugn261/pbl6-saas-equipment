import type { Principal } from '@pbl6/auth';
import { sameUuid } from '../common/uuid';

export const TERMINAL = ['COMPLETED', 'CANCELLED'];
export type WorkOrderAction =
  | 'assign'
  | 'accept'
  | 'reject'
  | 'start-travel'
  | 'start'
  | 'hold'
  | 'resume'
  | 'complete'
  | 'cancel';
export const ACTION_STATES: Record<WorkOrderAction, readonly string[]> = {
  assign: ['CREATED', 'ASSIGNED', 'ACCEPTED'],
  accept: ['ASSIGNED'],
  reject: ['ASSIGNED'],
  'start-travel': ['ACCEPTED'],
  start: ['ACCEPTED', 'TRAVELLING'],
  hold: ['IN_PROGRESS'],
  resume: ['ON_HOLD'],
  complete: ['IN_PROGRESS'],
  cancel: [
    'CREATED',
    'ASSIGNED',
    'ACCEPTED',
    'TRAVELLING',
    'IN_PROGRESS',
    'ON_HOLD',
  ],
};
export function isCurrentTechnician(p: Principal, userId?: string) {
  return p.permissions.has('work_order:execute') && sameUuid(p.userId, userId);
}
/** Shared by response hints and server-side transition checks; hints never authorize a request. */
export function mayAct(
  p: Principal,
  action: WorkOrderAction,
  assignedUserId?: string,
): boolean {
  switch (action) {
    case 'assign':
      return p.permissions.has('work_order:assign');
    case 'cancel':
      return p.permissions.has('work_order:manage');
    case 'hold':
    case 'resume':
      return (
        p.permissions.has('work_order:manage') ||
        isCurrentTechnician(p, assignedUserId)
      );
    case 'complete':
      return (
        isCurrentTechnician(p, assignedUserId) &&
        p.permissions.has('service_report:submit')
      );
    default:
      return isCurrentTechnician(p, assignedUserId);
  }
}
export function allowedWorkOrderActions(
  p: Principal,
  status: string,
  assignedUserId?: string,
) {
  const actions: string[] = [];
  if (!TERMINAL.includes(status) && p.permissions.has('work_order:manage'))
    actions.push('update');
  for (const action of Object.keys(ACTION_STATES) as WorkOrderAction[]) {
    if (
      ACTION_STATES[action].includes(status) &&
      mayAct(p, action, assignedUserId)
    )
      actions.push(action);
  }
  return actions;
}
