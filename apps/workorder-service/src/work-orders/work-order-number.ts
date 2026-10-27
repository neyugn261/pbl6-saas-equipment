import type { WorkOrderTx } from './work-orders.repository';

/** One sequence for both HTTP-created and event-created Work Orders. */
export async function nextWorkOrderNumber(tx: WorkOrderTx, tenantId: string) {
  const year = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date());
  const key = 'WO-' + year;
  const [sequence] = await tx.$queryRaw<{ last_value: bigint }[]>`
    INSERT INTO document_sequences (tenant_id, sequence_key, last_value)
    VALUES (${tenantId}::uuid, ${key}, 1)
    ON CONFLICT (tenant_id, sequence_key)
    DO UPDATE SET last_value = document_sequences.last_value + 1
    RETURNING last_value`;
  return key + '-' + String(sequence.last_value).padStart(4, '0');
}
