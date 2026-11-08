// Gateway + real Identity/Organization/Asset/Maintenance + isolated RabbitMQ.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
module.exports = async function (ctx) {
  const { call, A, M, manager, customerToken, other, warranty, item, dbs, scheduler, tenantId,
    customer, site, drain, evidence, fixtureUser, login, expire, registrationGroup, registrationReceipt } = ctx;
  const model = await call('POST', `${A}/equipment-models`, manager,
    { manufacturer: 'Handover test', modelCode: 'DELIVERY', name: 'Handover methods model' }, 201);
  const publish = async (path, body) => {
    const row = await call('POST', path, manager, { body }, 201);
    return call('POST', `${path}/${row.id}/publish`, manager, { expectedVersion: row.version }, 201);
  };
  await publish(`${A}/equipment-models/${model.id}/warranty-policies`, warranty);
  const rule = { id: randomUUID(), name: 'Monthly service', frequencyUnit: 'MONTH', frequencyValue: 1,
    firstOccurrence: 1, term: { mode: 'WARRANTY_END' }, checklist: [item] };
  const profile = { mode: 'APPLY', name: 'Accepted programme', terms: 'Frozen service terms', reason: '', rules: [rule] };
  await publish(`${M}/equipment-models/${model.id}/maintenance-profiles`, profile);
  const details = { condition: 'Đủ thiết bị và phụ kiện, hoạt động bình thường', notes: 'Khách kiểm tra thông tin trước khi đồng ý', expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() };
  const create = async (deliveryMethod, extra = {}) => {
    const code = `HANDOVER-${randomUUID()}`;
    return call('POST', `${A}/equipment-registrations`, manager, {
      deliveryMethod, ...(deliveryMethod === 'CUSTOMER_SITE' ? { handoverDetails: details } : {}),
      equipment: { mode: 'NEW', data: { modelId: model.id, customerId: customer.id, customerSiteId: site.id,
        assetCode: code, serialNumber: code, handoverDate: '2026-01-31', ...extra } },
    }, 201, { 'Idempotency-Key': randomUUID() });
  };
  const preview = row => call('POST', `${A}/equipment-registrations/${row.id}/model-policies`, manager, { expectedVersion: row.version }, 201);
  const submit = row => call('POST', `${A}/equipment-registrations/${row.id}/submit`, manager, { expectedVersion: row.version });
  const get = row => call('GET', `${A}/equipment-registrations/${row.id}`, manager);
  const handover = (id, token = customerToken) => call('GET', `${A}/my/equipment-handovers/${id}`, token);
  const decide = (row, action, token = customerToken, extra = {}) => call('POST', `${A}/my/equipment-handovers/${row.id}/${action}`, token,
    { expectedVersion: row.version, ...(action === 'reject' ? { reason: 'Ngày lắp đặt chưa đúng' } : {}), ...extra });

  const store = await create('STORE');
  assert.equal((await call('GET', `${A}/equipment/${store.equipmentId}`, manager)).status, 'OUT_OF_SERVICE');
  await call('PATCH', `${A}/equipment/${store.equipmentId}`, manager, { status: 'ACTIVE' }, 409);
  const savedStore = await submit(await preview(store));
  assert.equal(savedStore.status, 'COMPLETED');
  assert.equal(savedStore.handoverId, null);
  assert.equal(await dbs.asset.equipmentHandover.count({ where: { equipmentId: store.equipmentId } }), 0);
  const storeEq = await dbs.asset.equipment.findUniqueOrThrow({ where: { id: store.equipmentId } });
  assert.equal(storeEq.status, 'ACTIVE');
  assert.equal(storeEq.handoverRequired, false);
  assert.equal(storeEq.customerSiteId, site.id);
  assert.equal(storeEq.installationDate, null);
  assert.equal(storeEq.commissionedDate, null);
  const storeWarranty = await dbs.asset.warranty.findUniqueOrThrow({ where: { id: savedStore.warrantyId } });
  assert.equal(storeWarranty.startDate.toISOString().slice(0, 10), '2026-01-31');
  await create('STORE', { installationDate: '2026-02-01' }).then(() => assert.fail('Store installation must fail'), err => assert.match(String(err), /400/));

  const onsite = await create('CUSTOMER_SITE', { installationDate: '2026-02-01' });
  let pending = await submit(await preview(onsite));
  assert.equal(pending.status, 'PENDING_CUSTOMER_CONFIRMATION');
  assert.equal(pending.warrantyId, null);
  assert.equal(pending.completedAt, null);
  await assert.rejects(dbs.asset.equipmentRegistration.update({ where: { id: pending.id }, data: { deliveryMethod: null } }), /constraint|check/i);
  assert.equal(await dbs.maintenance.maintenancePlan.count({ where: { equipmentId: onsite.equipmentId } }), 0);
  await scheduler.tick('2026-06-01', tenantId);
  assert.equal(await dbs.maintenance.maintenanceTask.count({ where: { maintenancePlan: { equipmentId: onsite.equipmentId } } }), 0);
  await call('PATCH', `${A}/equipment/${onsite.equipmentId}`, manager, { handoverDate: '2026-02-03' }, 409);
  await call('PATCH', `${A}/equipment/${onsite.equipmentId}`, manager, { status: 'ACTIVE' }, 409);
  await call('POST', `${A}/equipment-handovers`, manager, { equipmentId: onsite.equipmentId, expiresAt: details.expiresAt,
    deliveryAt: new Date().toISOString(), condition: details.condition }, 409);
  await call('PUT', `${M}/internal/equipment-registrations/${onsite.id}/maintenance-group`, manager, undefined, 404);
  const blockedGroup = await fetch(`http://127.0.0.1:${ctx.ports.maintenance}/internal/equipment-registrations/${onsite.id}/maintenance-group`,
    { method: 'PUT', headers: { authorization: `Bearer ${manager}` } });
  assert.equal(blockedGroup.status, 502);
  const blockedSource = await fetch(`http://127.0.0.1:${ctx.ports.asset}/internal/equipment-registrations/${onsite.id}/model-policy-input`,
    { headers: { authorization: `Bearer ${manager}` } });
  assert.equal(blockedSource.status, 409);
  await call('POST', `${M}/maintenance-plans`, manager, { equipmentId: onsite.equipmentId, name: 'Bypass', frequencyUnit: 'MONTH', frequencyValue: 1, nextDueDate: '2027-01-01' }, 422);
  await call('POST', `${A}/equipment/${onsite.equipmentId}/warranties`, manager, { startDate: '2026-01-31', endDate: '2027-01-30', warrantyType: 'Bypass' }, 409);
  let sent = await handover(pending.handoverId);
  assert.equal(sent.snapshot.installationDate, '2026-02-01');
  assert.equal(sent.snapshot.commissionedDate, null);
  assert.ok(!JSON.stringify(sent.snapshot).includes('overrideReason'));
  await call('GET', `${A}/equipment-registrations/${onsite.id}`, other, undefined, 404);
  await call('GET', `${A}/my/equipment-handovers/${sent.id}`, other, undefined, 403);
  await call('POST', `${A}/my/equipment-handovers/${sent.id}/accept`, manager, { expectedVersion: sent.version }, 403);
  await call('POST', `${A}/my/equipment-handovers/${sent.id}/accept`, customerToken, {}, 409);
  await call('POST', `${A}/my/equipment-handovers/${sent.id}/accept`, customerToken, { expectedVersion: sent.version + 1 }, 409);
  const readOnlyUser = await fixtureUser('CUSTOMER_USER', tenantId, `readonly-${randomUUID()}@handover.test`, customer.id);
  await call('POST', `${A}/my/equipment-handovers/${sent.id}/accept`, await login(readOnlyUser.email), { expectedVersion: sent.version }, 403);
  await decide(sent, 'reject');
  let corrected = await get(onsite);
  assert.equal(corrected.status, 'DRAFT');
  assert.equal(corrected.policyPreview, null);
  assert.equal(await dbs.asset.warranty.count({ where: { equipmentId: onsite.equipmentId } }), 0);
  await call('PATCH', `${A}/equipment/${onsite.equipmentId}`, manager, { handoverDate: '2026-03-01', installationDate: '2026-03-02' });
  corrected = await call('PATCH', `${A}/equipment-registrations/${onsite.id}`, manager,
    { expectedVersion: corrected.version, handoverDetails: { ...details, notes: 'Đã sửa ngày theo phản hồi khách' } });
  pending = await submit(await preview(corrected));
  const replacement = await handover(pending.handoverId);
  assert.notEqual(replacement.id, sent.id);
  assert.equal(replacement.snapshot.handoverDate, '2026-03-01');
  assert.equal((await handover(sent.id)).snapshot.handoverDate, '2026-01-31');
  await call('POST', `${A}/my/equipment-handovers/${sent.id}/accept`, customerToken, { expectedVersion: sent.version }, 409);
  // A later default policy cannot replace the snapshot already sent to the customer.
  await publish(`${A}/equipment-models/${model.id}/warranty-policies`, { ...warranty, durationMonths: 36 });
  await Promise.all([decide(replacement, 'accept'), decide(replacement, 'accept')]);
  const accepted = await get(onsite);
  assert.equal(accepted.status, 'COMPLETED');
  assert.equal(accepted.maintenanceProvisioning, 'PENDING');
  assert.equal(await dbs.asset.warranty.count({ where: { equipmentId: onsite.equipmentId } }), 1);
  assert.equal(await dbs.maintenance.maintenancePlan.count({ where: { equipmentId: onsite.equipmentId } }), 0);
  const actualWarranty = await dbs.asset.warranty.findUniqueOrThrow({ where: { id: accepted.warrantyId } });
  assert.equal(actualWarranty.startDate.toISOString().slice(0, 10), '2026-03-01');
  assert.equal(actualWarranty.endDate.toISOString().slice(0, 10), pending.policyPreview.warranty.endDate);
  await drain(async () => (await dbs.asset.equipmentRegistration.findUniqueOrThrow({ where: { id: onsite.id } })).maintenanceProvisioning === 'READY');
  const ready = await get(onsite);
  assert.equal(ready.maintenancePlanIds.length, 1);
  const plan = await dbs.maintenance.maintenancePlan.findUniqueOrThrow({ where: { id: ready.maintenancePlanIds[0] } });
  assert.equal(plan.anchorDate.toISOString().slice(0, 10), '2026-03-01');
  assert.equal(plan.nextDueDate.toISOString().slice(0, 10), '2026-04-01');
  assert.equal(plan.endDate.toISOString(), actualWarranty.endDate.toISOString());
  // Redelivery with a fresh event ID must still reuse the exact group receipt.
  const event = await dbs.asset.outboxEvent.findFirstOrThrow({ where: { aggregateId: onsite.id, eventType: 'EquipmentRegistrationConfirmed' } });
  const { Events } = require('../packages/event-contracts/dist');
  const createEnvelope = (definition, input) => ({ eventId: randomUUID(), eventType: definition.type, eventVersion: definition.version,
    producer: definition.producer, aggregateType: definition.aggregateType, occurredAt: new Date().toISOString(), correlationId: null, ...input });
  const confirmation = createEnvelope(Events.EquipmentRegistrationConfirmed, { tenantId, aggregateId: onsite.id, payload: event.payload.data });
  await registrationGroup().confirmed(confirmation);
  await registrationGroup().confirmed({ ...confirmation, eventId: randomUUID() });
  assert.equal(await dbs.maintenance.maintenancePlan.count({ where: { equipmentId: onsite.equipmentId } }), 1);
  const receipt = { registrationId: ready.id, equipmentId: ready.equipmentId, inputHash: ready.policyPreview.hash,
    plans: [{ itemId: rule.id, planId: plan.id }] };
  await registrationReceipt().handle(createEnvelope(Events.RegistrationMaintenanceReady, { tenantId, aggregateId: ready.id, payload: receipt }));
  await registrationReceipt().handle(createEnvelope(Events.RegistrationMaintenanceReady, { tenantId, aggregateId: ready.id, payload: receipt }));
  await assert.rejects(registrationReceipt().handle(createEnvelope(Events.RegistrationMaintenanceReady, { tenantId, aggregateId: ready.id,
    payload: { ...receipt, plans: [{ itemId: rule.id, planId: randomUUID() }] } })), /Conflicting maintenance receipt/);
  await assert.rejects(registrationGroup().confirmed({ ...confirmation, eventId: randomUUID(), producer: 'workorder-service' }), /Invalid registration confirmation source/);
  assert.equal((await get(onsite)).completedAt, accepted.completedAt);
  await scheduler.tick('2026-04-01', tenantId);
  assert.equal(await dbs.maintenance.maintenanceTask.count({ where: { maintenancePlanId: plan.id } }), 1);

  const expired = await create('CUSTOMER_SITE');
  const expiredPending = await submit(await preview(expired));
  await dbs.asset.equipmentHandover.update({ where: { id: expiredPending.handoverId }, data: { expiresAt: new Date(0) } });
  await expire();
  assert.equal((await get(expired)).status, 'DRAFT');
  assert.equal((await handover(expiredPending.handoverId)).status, 'EXPIRED');
  assert.equal(await dbs.asset.warranty.count({ where: { equipmentId: expired.equipmentId } }), 0);
  assert.equal(await dbs.maintenance.maintenancePlan.count({ where: { equipmentId: expired.equipmentId } }), 0);
  assert.equal((await dbs.asset.equipment.findUniqueOrThrow({ where: { id: expired.equipmentId } })).status, 'OUT_OF_SERVICE');
  // Staff reconciliation can finish a delayed group without impersonating the customer.
  const recovery = await create('CUSTOMER_SITE');
  const recoveryPending = await submit(await preview(recovery));
  await decide(await handover(recoveryPending.handoverId), 'accept');
  const recovered = await call('POST', `${A}/equipment-registrations/${recovery.id}/resume`, manager, {});
  assert.equal(recovered.status, 'COMPLETED');
  assert.equal(recovered.maintenanceProvisioning, 'READY');
  const completedAt = recovered.completedAt;
  const recoveryEvent = await dbs.asset.outboxEvent.findFirstOrThrow({ where: { aggregateId: recovery.id, eventType: 'EquipmentRegistrationConfirmed' } });
  await drain(async () => await dbs.maintenance.processedEvent.count({ where: { eventId: recoveryEvent.id, consumer: 'maintenance-service.registration-confirmations' } }) === 1);
  assert.equal(await dbs.maintenance.maintenancePlan.count({ where: { equipmentId: recovery.equipmentId } }), 1);
  assert.equal((await get(recovery)).completedAt, completedAt);

  const noneModel = await call('POST', `${A}/equipment-models`, manager,
    { manufacturer: 'Handover test', modelCode: 'NO-SERVICE', name: 'Explicit no-service handover' }, 201);
  await publish(`${A}/equipment-models/${noneModel.id}/warranty-policies`, { ...warranty, mode: 'NONE', reason: 'Không áp dụng bảo hành' });
  await publish(`${M}/equipment-models/${noneModel.id}/maintenance-profiles`, { ...profile, mode: 'NONE', reason: 'Không bảo trì định kỳ', rules: [] });
  for (const method of ['STORE', 'CUSTOMER_SITE']) {
    const noService = await create(method, { modelId: noneModel.id });
    let result = await submit(await preview(noService));
    if (method === 'CUSTOMER_SITE') {
      assert.equal(result.status, 'PENDING_CUSTOMER_CONFIRMATION');
      await decide(await handover(result.handoverId), 'accept');
      result = await get(noService);
    }
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.warrantyId, null);
    assert.equal(result.maintenanceProvisioning, null);
    assert.deepEqual(result.maintenancePlanIds, []);
    assert.equal((await dbs.asset.equipment.findUniqueOrThrow({ where: { id: result.equipmentId } })).status, 'ACTIVE');
  }
  evidence.push({ case: 'STORE staff completion; CUSTOMER_SITE fifth-step gate; real Customer Admin acceptance, rejection/correction/version replacement and expiry; frozen actual dates; no pre-acceptance maintenance; reliable/idempotent async provisioning', status: 'PASS' });
  if (process.env.HANDOVER_METHODS_BROWSER === 'true') await require('./test-handover-methods-browser.cjs')({ ...ctx, model, store: savedStore, onsite: ready, create, preview, submit });
};
