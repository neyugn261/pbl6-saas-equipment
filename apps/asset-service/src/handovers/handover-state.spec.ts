import { canTransition, type HandoverAction } from './handover-state';
const states = ['DRAFT', 'PENDING_CUSTOMER_CONFIRMATION', 'ACCEPTED', 'ACTIVATED', 'REJECTED', 'EXPIRED', 'CANCELLED'];
const actions: HandoverAction[] = ['submit', 'accept', 'reject', 'cancel', 'expire'];
const allowed = new Set(['DRAFT:submit', 'DRAFT:cancel', 'PENDING_CUSTOMER_CONFIRMATION:accept',
  'PENDING_CUSTOMER_CONFIRMATION:reject', 'PENDING_CUSTOMER_CONFIRMATION:cancel', 'PENDING_CUSTOMER_CONFIRMATION:expire']);
it.each(states.flatMap(state => actions.map(action => [state, action] as const)))('%s / %s enforces the decision lifecycle', (state, action) => {
  expect(canTransition(state, action)).toBe(allowed.has(`${state}:${action}`));
});
