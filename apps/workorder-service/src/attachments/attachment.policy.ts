import { createHash } from 'node:crypto';
import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import type { Principal } from '@pbl6/auth';
import type { WorkOrderRow } from '../work-orders/work-orders.repository';
import { sameUuid } from '../common/uuid';
import { badInput, conflict } from '../common/errors';
import type { PrepareAttachmentDto } from './attachment.dto';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const UPLOAD_TTL_MS = 300_000;
export const ATTEMPT_LEASE_MS = 120_000;
export const CLEANUP_GRACE_MS = 60_000;
export const MANAGED_PREFIX = 'workorder-attachments/';
export type AttachmentTarget = 'WORK_ORDER' | 'REPORT';
export interface AttachmentParent {
  order: WorkOrderRow;
  report: { id: string; technician: { userId: string } } | null;
  type: AttachmentTarget;
}
export function forbidden() {
  return new ForbiddenException({
    code: 'FORBIDDEN',
    message: 'Attachment operation is not permitted',
  });
}
export function validatePrepare(input: PrepareAttachmentDto) {
  if (
    !input.fileName.trim() ||
    input.fileName === '.' ||
    input.fileName === '..' ||
    /[\p{Cc}\p{Cf}/\\]/u.test(input.fileName)
  )
    throw badInput('fileName must be a basename without control characters');
  if (!['image/jpeg', 'image/png', 'application/pdf'].includes(input.mimeType))
    throw new HttpException(
      {
        code: 'ATTACHMENT_TYPE_UNSUPPORTED',
        message: 'Only JPEG, PNG and PDF are supported',
      },
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    );
  if (input.sizeBytes > MAX_ATTACHMENT_BYTES)
    throw new HttpException(
      { code: 'ATTACHMENT_TOO_LARGE', message: 'Maximum file size is 10 MiB' },
      HttpStatus.PAYLOAD_TOO_LARGE,
    );
}
export function assertMutation(p: Principal, parent: AttachmentParent) {
  const manager = p.permissions.has('work_order:manage');
  const execute = p.permissions.has('work_order:execute');
  if (parent.type === 'REPORT') {
    if (
      !manager &&
      !(
        execute &&
        p.permissions.has('service_report:submit') &&
        sameUuid(p.userId, parent.report?.technician.userId)
      )
    )
      throw forbidden();
    if (parent.order.status !== 'COMPLETED')
      throw conflict(
        'ATTACHMENT_PARENT_STATE_CONFLICT',
        'Report files require a completed Work Order',
      );
  } else {
    const states = manager
      ? [
          'CREATED',
          'ASSIGNED',
          'ACCEPTED',
          'TRAVELLING',
          'IN_PROGRESS',
          'ON_HOLD',
        ]
      : ['ACCEPTED', 'TRAVELLING', 'IN_PROGRESS', 'ON_HOLD'];
    if (!states.includes(parent.order.status))
      throw conflict(
        'ATTACHMENT_PARENT_STATE_CONFLICT',
        'Work Order no longer permits file mutation',
      );
    const assignment = parent.order.assignments[0];
    if (
      !manager &&
      !(
        execute &&
        assignment?.status === 'ACCEPTED' &&
        sameUuid(assignment.technician.userId, p.userId)
      )
    )
      throw forbidden();
  }
}
export function assertVisibility(p: Principal, visibility: string) {
  if (visibility === 'CUSTOMER' && !p.permissions.has('work_order:manage'))
    throw forbidden();
}
export const fingerprint = (values: unknown[]) =>
  createHash('sha256').update(JSON.stringify(values)).digest('hex');
export function verifyBytes(
  bytes: Buffer,
  expected: { sizeBytes: number; mimeType: string; checksumSha256: string },
) {
  const type = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? 'image/png'
    : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      ? 'image/jpeg'
      : bytes.subarray(0, 5).toString('ascii') === '%PDF-'
        ? 'application/pdf'
        : null;
  if (
    bytes.length !== expected.sizeBytes ||
    bytes.length > MAX_ATTACHMENT_BYTES ||
    type !== expected.mimeType ||
    createHash('sha256').update(bytes).digest('hex') !== expected.checksumSha256
  )
    throw new HttpException(
      {
        code: 'UPLOAD_VERIFICATION_FAILED',
        message:
          'Stored bytes do not match the declared size, type or checksum',
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
}
