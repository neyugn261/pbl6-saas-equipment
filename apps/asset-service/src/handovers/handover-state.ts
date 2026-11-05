export type HandoverAction = 'submit' | 'accept' | 'reject' | 'cancel' | 'expire';
export function canTransition(status: string, action: HandoverAction): boolean {
  return (status === 'DRAFT' && ['submit', 'cancel'].includes(action)) ||
    (status === 'PENDING_CUSTOMER_CONFIRMATION' && ['accept', 'reject', 'cancel', 'expire'].includes(action));
}
