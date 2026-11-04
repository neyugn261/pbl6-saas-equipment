import { ConflictException, BadRequestException } from '@nestjs/common';
import {
  validChecklist,
  type ChecklistItem,
  type ChecklistResult,
} from '@pbl6/event-contracts';
export function validateResults(
  items: ChecklistItem[],
  results: ChecklistResult[],
  complete = false,
) {
  const ids = new Set<string>();
  for (const result of results) {
    const item = items.find((i) => i.id === result.itemId);
    if (
      !item ||
      ids.has(result.itemId) ||
      !['NOT_DONE', 'DONE', 'NOT_APPLICABLE'].includes(result.status) ||
      typeof result.note !== 'string' ||
      result.note.length > 2000
    )
      throw new BadRequestException({
        code: 'INVALID_CHECKLIST_RESULT',
        message: 'Unknown, duplicate or invalid checklist item',
      });
    ids.add(result.itemId);
    if (
      result.status === 'NOT_APPLICABLE' &&
      (!item.allowNotApplicable || !result.note.trim())
    )
      throw new BadRequestException({
        code: 'CHECKLIST_REASON_REQUIRED',
        message: 'This item requires completion or an allowed N/A with reason',
      });
  }
  if (
    complete &&
    items.some(
      (item) =>
        item.required &&
        !results.some(
          (r) =>
            r.itemId === item.id &&
            (r.status === 'DONE' || r.status === 'NOT_APPLICABLE'),
        ),
    )
  )
    throw new ConflictException({
      code: 'CHECKLIST_INCOMPLETE',
      message:
        'Complete all required checklist items before submitting the report',
    });
}
export function requiredChecklist(raw: unknown): ChecklistItem[] {
  if (!validChecklist(raw))
    throw new ConflictException({
      code: 'CHECKLIST_INVALID',
      message: 'Stored work instructions need reconciliation',
    });
  return raw;
}
