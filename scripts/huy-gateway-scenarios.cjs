const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { parseEnvelope } = require('../packages/event-contracts/dist');

/** Extends the real branch stack; all business writes below go through Gateway. */
module.exports = async function run(ctx) {
  const { call, drain, dbs, bus, tenantId, a, b, admin, customerToken, otherCustomerToken,
    users, technicianA, technicianB, eqA, quoteEquipment, requestFor, fixtureUser, tenantCodeA, password, S, W, N } = ctx;
  const checks = [];
  const srState = (id) => dbs['service-request'].serviceRequest.findUniqueOrThrow({ where: { id } });
  async function finish(wo, manager, technician, technicianToken, result, reason) {
    await call('POST', `${W}/work-orders/${wo.id}/assign`, manager, { technicianId: technician.id });
    await call('POST', `${W}/work-orders/${wo.id}/accept`, technicianToken, {});
    await call('POST', `${W}/work-orders/${wo.id}/start`, technicianToken, {});
    await call('POST', `${W}/work-orders/${wo.id}/complete`, technicianToken, {
      problemDescription: 'HU acceptance diagnosis', solution: 'Recorded technical findings', result,
      customerSummary: 'Đã ghi nhận kết quả kiểm tra thiết bị.',
      ...(reason ? { unresolvedReason: reason } : {}),
      signOff: { status: 'CUSTOMER_ABSENT', notes: 'Khách vắng mặt; ghi nhận kết quả kỹ thuật.' },
    });
  }
  async function replayCompleted(woId) {
    const row = await dbs.workorder.outboxEvent.findFirstOrThrow({ where: { aggregateId: woId, eventType: 'WorkOrderCompleted', eventVersion: 2 } });
    const eventId = randomUUID();
    await bus.publish(parseEnvelope(JSON.stringify({ eventId, eventType: row.eventType, eventVersion: row.eventVersion,
      producer: 'workorder-service', tenantId, aggregateType: row.aggregateType, aggregateId: row.aggregateId,
      occurredAt: row.occurredAt.toISOString(), correlationId: null, payload: row.payload.data })));
    await drain(async () => !!await dbs['service-request'].processedEvent.findFirst({ where: { eventId } }) &&
      !!await dbs.notification.processedEvent.findFirst({ where: { eventId } }));
    assert.equal(await dbs.notification.notification.count({ where: { sourceEventId: eventId } }), 0);
  }

  for (const decision of ['approve', 'reject']) {
    const sr = await requestFor(quoteEquipment);
    await call('POST', `${S}/service-requests/${sr.id}/review`, b, {});
    await call('POST', `${W}/work-orders`, customerToken, { serviceRequestId: sr.id, type: 'INSPECTION' }, 403);
    await call('POST', `${W}/work-orders`, a, { serviceRequestId: sr.id, type: 'INSPECTION' }, 404);
    const wo = await call('POST', `${W}/work-orders`, b, { serviceRequestId: sr.id, type: 'INSPECTION' }, 201);
    await call('POST', `${W}/work-orders`, b, { serviceRequestId: sr.id, type: 'INSPECTION' }, 409);
    await drain(async () => (await srState(sr.id)).status === 'PROCESSING');
    await finish(wo, b, technicianB, users.techB.token, 'UNRESOLVED', 'Cần lập dự toán sửa chữa sau khảo sát.');
    await drain(async () => (await srState(sr.id)).status === 'REVIEWING');
    assert.equal((await srState(sr.id)).resolvedAt, null);
    assert.equal(await dbs['service-request'].costEstimate.count({ where: { requestId: sr.id } }), 0);
    const estimate = await call('POST', `${S}/service-requests/${sr.id}/estimates`, b,
      { items: [{ itemType: 'LABOR', description: 'Sửa chữa sau khảo sát miễn phí', quantity: '1', unitPrice: '100000' }] }, 201);
    await call('POST', `${S}/service-requests/estimates/${estimate.id}/send`, b, {});
    await call('POST', `${W}/work-orders`, b, { serviceRequestId: sr.id, type: 'REPAIR' }, 422);
    await call('POST', `${S}/service-requests/estimates/${estimate.id}/${decision}`, otherCustomerToken, {}, 404);
    await call('POST', `${S}/service-requests/estimates/${estimate.id}/${decision}`, customerToken, {});
    assert.equal((await srState(sr.id)).status, decision === 'approve' ? 'ACCEPTED' : 'COST_REJECTED');
    if (decision === 'approve') {
      const repair = await call('POST', `${W}/work-orders`, b, { serviceRequestId: sr.id, type: 'REPAIR' }, 201);
      await drain(async () => (await srState(sr.id)).activeWorkOrderId === repair.id);
      await replayCompleted(wo.id);
      await finish(repair, b, technicianB, users.techB.token, 'RESOLVED');
      await drain(async () => (await srState(sr.id)).status === 'RESOLVED');
      assert.equal((await srState(sr.id)).resolvedWorkOrderNo, repair.workOrderNo);
    }
  }
  checks.push('HU-01: Gateway INSPECTION from REVIEWING, duplicate/role/branch rejection, real completion event, free survey then estimate approve/reject, repair occurrence survives replay');

  const sr = await requestFor(eqA);
  await call('POST', `${S}/service-requests/${sr.id}/review`, a, {});
  await call('POST', `${S}/service-requests/${sr.id}/accept`, a, {});
  const wo = await call('POST', `${W}/work-orders`, a, { serviceRequestId: sr.id }, 201);
  await drain(async () => (await srState(sr.id)).status === 'PROCESSING');
  await finish(wo, a, technicianA, users.techA.token, 'UNRESOLVED', 'Thiếu linh kiện thay thế.');
  await drain(async () => (await srState(sr.id)).resolutionResult === 'UNRESOLVED');
  const queue = await call('GET', `${S}/service-requests?followUp=UNRESOLVED`, a);
  assert.equal(queue.items.find((r) => r.id === sr.id)?.followUp.reason, 'Thiếu linh kiện thay thế.');
  const queueB = await call('GET', `${S}/service-requests?followUp=UNRESOLVED`, b);
  assert.ok(queueB.items.every((r) => r.id !== sr.id));
  await call('GET', `${S}/service-requests?followUp=UNRESOLVED`, customerToken, undefined, 403);
  await drain(async () => !!await dbs.notification.notification.findFirst({ where: { tenantId, userId: users.managerA.id, title: 'Chưa xử lý được', payload: { path: ['resourceId'], equals: sr.id } } }));
  const notices = await call('GET', N, a);
  const notice = notices.items.find((n) => n.resourceId === sr.id && n.title === 'Chưa xử lý được');
  assert.ok(notice);
  await call('PATCH', `${N}/${notice.id}/read`, a, {});
  assert.ok((await call('GET', `${S}/service-requests?followUp=UNRESOLVED`, a)).items.some((r) => r.id === sr.id));
  const replacement = await call('POST', `${W}/work-orders`, a, { serviceRequestId: sr.id }, 201);
  await drain(async () => (await srState(sr.id)).activeWorkOrderId === replacement.id);
  await finish(replacement, a, technicianA, users.techA.token, 'RESOLVED');
  await drain(async () => (await srState(sr.id)).status === 'RESOLVED');
  await replayCompleted(wo.id);
  await drain(async () => (await srState(sr.id)).resolvedWorkOrderNo === replacement.workOrderNo);
  assert.ok((await call('GET', `${S}/service-requests?followUp=UNRESOLVED`, a)).items.every((r) => r.id !== sr.id));
  await call('GET', `${S}/service-requests?unallocated=true`, a, undefined, 403);
  await call('GET', `${S}/service-requests?unallocated=true`, admin);
  checks.push('HU-02: Gateway unresolved reason/branch scope, notification mark-read independent of queue, replacement resolution and stale completion replay');

  const partial = await requestFor(eqA);
  await call('POST', `${S}/service-requests/${partial.id}/review`, a, {});
  await call('POST', `${S}/service-requests/${partial.id}/accept`, a, {});
  const partialWo = await call('POST', `${W}/work-orders`, a, { serviceRequestId: partial.id }, 201);
  await drain(async () => (await srState(partial.id)).status === 'PROCESSING');
  await finish(partialWo, a, technicianA, users.techA.token, 'PARTIALLY_RESOLVED', 'Cần bổ sung linh kiện.');
  await drain(async () => (await srState(partial.id)).status === 'RESOLVED');
  const partialQueue = await call('GET', `${S}/service-requests?followUp=PARTIALLY_RESOLVED`, a);
  assert.ok(partialQueue.items.some((r) => r.id === partial.id));
  assert.ok((await call('GET', `${S}/service-requests?followUp=PARTIALLY_RESOLVED`, b)).items.every((r) => r.id !== partial.id));
  assert.equal((await srState(partial.id)).closedAt, null);
  checks.push('HU-02: real PARTIALLY_RESOLVED completion remains in the correct branch queue and is not automatically closed');

  const email = `hu04-${randomUUID()}@mail-smoke.local`;
  await fixtureUser('TECHNICIAN', tenantId, email);
  const auth = '/api/identity/auth';
  const loggedIn = await call('POST', `${auth}/login`, null, { tenantCode: tenantCodeA, email, password });
  await call('POST', `${auth}/change-password`, loggedIn.accessToken,
    { currentPassword: password, newPassword: 'Changed#Pass42' }, 204);
  await call('GET', `${auth}/me`, loggedIn.accessToken, undefined, 401);
  await call('POST', `${auth}/login`, null, { tenantCode: tenantCodeA, email, password }, 401);
  const challenge = await call('POST', `${auth}/forgot-password`, null, { tenantCode: tenantCodeA, email }, 202);
  const api = process.env.MAILPIT_API_URL;
  assert.ok(api, 'Real Mailpit API required for HU-04 Gateway acceptance');
  let otp;
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    const inbox = await (await fetch(`${api}/api/v1/messages`)).json();
    const message = inbox.messages.find((m) => m.To.some((to) => to.Address === email));
    if (message) {
      const detail = await (await fetch(`${api}/api/v1/message/${message.ID}`)).json();
      otp = detail.Text.match(/mật khẩu của bạn: (\d{6})/)?.[1];
      if (otp) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.match(otp || '', /^\d{6}$/);
  const input = { challengeId: challenge.challengeId, otp, newPassword: 'Recovered#Pass43' };
  await call('POST', `${auth}/reset-password`, null, input, 204);
  await call('POST', `${auth}/reset-password`, null, input, 400);
  await call('POST', `${auth}/login`, null, { tenantCode: tenantCodeA, email, password: input.newPassword });
  checks.push('HU-04: real Gateway change-password, revoked /me, Mailpit OTP receipt, reset, replay rejection and new-password login');
  return checks;
};
