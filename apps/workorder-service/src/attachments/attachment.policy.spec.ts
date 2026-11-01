import { createHash } from 'node:crypto';
import { AccessTokenVerifier } from '@pbl6/auth';
import { signTestAccessToken, testJwtEnv } from '@pbl6/testing';
import {
  assertMutation,
  validatePrepare,
  verifyBytes,
  type AttachmentParent,
} from './attachment.policy';
const tenantId = '10000000-0000-4000-8000-000000000001';
const userId = '10000000-0000-4000-8000-000000000002';
const env = testJwtEnv();
const verifier = new AccessTokenVerifier({
  secret: env.JWT_ACCESS_SECRET,
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
});
const technician = verifier.verify(
  signTestAccessToken({ role: 'TECHNICIAN', tenantId, userId }),
);
const manager = verifier.verify(
  signTestAccessToken({ role: 'SERVICE_MANAGER', tenantId, userId }),
);
const input = {
  fileName: 'report.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 10,
  checksumSha256: 'a'.repeat(64),
};
describe('Attachment policy and actual-byte verification', () => {
  it.each([
    '../x.pdf',
    'a/b.pdf',
    'a\\b.pdf',
    '.',
    '..',
    'a\r\nx.pdf',
    '\u202ebad.pdf',
    ' ',
  ])('rejects unsafe filename %j', (fileName) => {
    expect(() => validatePrepare({ ...input, fileName })).toThrow();
  });
  it('distinguishes unsupported type and oversize errors', () => {
    expect(() => validatePrepare({ ...input, mimeType: 'text/html' })).toThrow(
      'Only JPEG',
    );
    expect(() => validatePrepare({ ...input, sizeBytes: 10_485_761 })).toThrow(
      'Maximum file',
    );
  });
  it('verifies bytes and type independently of Content-Type and declared hash', () => {
    const bytes = Buffer.from('%PDF-1.7\nfixture');
    const metadata = {
      sizeBytes: bytes.length,
      mimeType: 'application/pdf',
      checksumSha256: createHash('sha256').update(bytes).digest('hex'),
    };
    expect(() => verifyBytes(bytes, metadata)).not.toThrow();
    expect(() =>
      verifyBytes(bytes, { ...metadata, mimeType: 'image/jpeg' }),
    ).toThrow();
    expect(() =>
      verifyBytes(bytes, { ...metadata, sizeBytes: bytes.length + 1 }),
    ).toThrow();
    expect(() =>
      verifyBytes(bytes, { ...metadata, checksumSha256: 'a'.repeat(64) }),
    ).toThrow();
    const spoof = Buffer.from('<html>fixture');
    expect(() =>
      verifyBytes(spoof, {
        ...metadata,
        sizeBytes: spoof.length,
        checksumSha256: createHash('sha256').update(spoof).digest('hex'),
      }),
    ).toThrow();
  });
  it('allows manager WO nonterminal and accepted current technician only', () => {
    const parent = {
      type: 'WORK_ORDER',
      report: null,
      order: { status: 'CREATED', assignments: [] },
    } as unknown as AttachmentParent;
    expect(() => assertMutation(manager, parent)).not.toThrow();
    expect(() => assertMutation(technician, parent)).toThrow();
    parent.order.status = 'IN_PROGRESS';
    parent.order.assignments = [
      { status: 'ACCEPTED', technician: { userId } },
    ] as typeof parent.order.assignments;
    expect(() => assertMutation(technician, parent)).not.toThrow();
    parent.order.status = 'COMPLETED';
    expect(() => assertMutation(technician, parent)).toThrow(
      'no longer permits',
    );
  });
  it('permits report author after completion but rejects a past assignee who is not the author', () => {
    const parent = {
      type: 'REPORT',
      report: { id: 'report', technician: { userId } },
      order: { status: 'COMPLETED', assignments: [] },
    } as unknown as AttachmentParent;
    expect(() => assertMutation(technician, parent)).not.toThrow();
    parent.report!.technician.userId = 'other-user';
    expect(() => assertMutation(technician, parent)).toThrow();
  });
});
