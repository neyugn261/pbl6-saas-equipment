// Runs on the owning services' dedicated test databases in test-model-policies.cjs.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

module.exports = async function ({ call, A, M, manager, customerToken, other, warranty, item,
  registration, dbs, scheduler, tenantId, drain, evidence, root, ports, tenantCode, password }) {
  const model = await call('POST', `${A}/equipment-models`, manager,
    { manufacturer: 'Term test', modelCode: 'TERM-TEST', name: 'Model with maintenance terms' }, 201);
  const wp = `${A}/equipment-models/${model.id}/warranty-policies`;
  const mp = `${M}/equipment-models/${model.id}/maintenance-profiles`;
  const publish = async (path, body) => {
    const row = await call('POST', path, manager, { body }, 201);
    return call('POST', `${path}/${row.id}/publish`, manager, { expectedVersion: row.version }, 201);
  };
  await publish(wp, warranty);
  const rules = [
    { id: randomUUID(), name: 'Two year inspections', frequencyUnit: 'MONTH', frequencyValue: 3,
      firstOccurrence: 1, term: { mode: 'YEARS', years: 2 }, checklist: [item] },
    { id: randomUUID(), name: 'Lifetime inspections', frequencyUnit: 'MONTH', frequencyValue: 6,
      firstOccurrence: 1, term: { mode: 'UNLIMITED' }, checklist: [item] },
    { id: randomUUID(), name: 'Warranty inspections', frequencyUnit: 'MONTH', frequencyValue: 3,
      firstOccurrence: 1, term: { mode: 'WARRANTY_END' }, checklist: [item] },
  ];
  const profile = { mode: 'APPLY', name: 'Term programme', terms: 'Service period agreed at handover', reason: '', rules };
  await publish(mp, profile);
  await call('POST', mp, customerToken, { body: profile }, 403);
  await call('POST', mp, manager, { body: { ...profile, rules: [{ ...rules[0], term: { mode: 'YEARS', years: 0 } }] } }, 400);
  const draft = await registration('MAINTENANCE-TERMS', model.id);
  const preview = await call('POST', `${A}/equipment-registrations/${draft.id}/model-policies`, manager,
    { expectedVersion: draft.version, durationMonths: 18, reason: 'Customer extended warranty' }, 201);
  assert.deepEqual(preview.policyPreview.maintenance.firstDueDates.map(row => row.endDate), ['2028-01-31', null, '2027-07-30']);
  await publish(wp, { ...warranty, durationMonths: 36 });
  const done = await call('POST', `${A}/equipment-registrations/${draft.id}/submit`, manager,
    { expectedVersion: preview.version });
  assert.equal(done.status, 'COMPLETED');
  const replay = await call('POST', `${A}/equipment-registrations/${draft.id}/resume`, manager, {});
  assert.deepEqual(replay.maintenancePlanIds, done.maintenancePlanIds);
  const plans = await dbs.maintenance.maintenancePlan.findMany({ where: { equipmentId: draft.equipmentId } });
  assert.equal(plans.length, 3);
  const fixed = plans.find(plan => plan.setupItemId === rules[0].id);
  const unlimited = plans.find(plan => plan.setupItemId === rules[1].id);
  const bound = plans.find(plan => plan.setupItemId === rules[2].id);
  assert.equal(fixed.termMode, 'YEARS');
  assert.equal(fixed.termYears, 2);
  assert.equal(fixed.endDate.toISOString().slice(0, 10), '2028-01-31');
  assert.equal(unlimited.endDate, null);
  assert.equal(bound.endDate.toISOString().slice(0, 10), '2027-07-30');
  const customerPlan = await call('GET', `${M}/maintenance-plans/${bound.id}`, customerToken);
  assert.equal(customerPlan.endDate, '2027-07-30');
  await call('GET', `${M}/maintenance-plans/${bound.id}`, other, undefined, 404);
  const disclosure = await call('GET', `${A}/equipment/${draft.equipmentId}/applied-policies`, customerToken);
  assert.equal(disclosure.snapshot.maintenance.firstDueDates[2].endDate, '2027-07-30');
  await scheduler.tick('2027-07-30', tenantId);
  await scheduler.tick('2027-07-31', tenantId);
  assert.equal((await dbs.maintenance.maintenancePlan.findUniqueOrThrow({ where: { id: bound.id } })).status, 'INACTIVE');
  assert.equal(await dbs.maintenance.maintenanceTask.count({ where: { maintenancePlanId: bound.id,
    scheduledDate: { gt: new Date('2027-07-30T00:00:00Z') } } }), 0);
  await scheduler.tick('2028-01-31', tenantId);
  assert.equal(await dbs.maintenance.maintenanceTask.count({ where: { maintenancePlanId: fixed.id,
    scheduledDate: new Date('2028-01-31T00:00:00Z') } }), 1);
  await scheduler.tick('2028-02-01', tenantId);
  assert.equal((await dbs.maintenance.maintenancePlan.findUniqueOrThrow({ where: { id: fixed.id } })).status, 'INACTIVE');
  assert.equal((await dbs.maintenance.maintenancePlan.findUniqueOrThrow({ where: { id: unlimited.id } })).status, 'ACTIVE');
  const taskCount = await dbs.maintenance.maintenanceTask.count({ where: { maintenancePlanId: { in: plans.map(p => p.id) } } });
  await drain(async () => (await dbs.workorder.workOrder.count({ where: { equipmentId: draft.equipmentId } })) === taskCount);
  if (process.env.MAINTENANCE_TERMS_BROWSER === 'true')
    evidence.push(await require('./test-maintenance-terms-browser.cjs')({ root, ports, tenantCode, password,
      modelId: model.id, registrationId: draft.id, planId: fixed.id }));
  await publish(wp, { ...warranty, mode: 'NONE', reason: 'No warranty in this agreement' });
  const noWarranty = await registration('TERM-NO-WARRANTY', model.id);
  const rejected = await call('POST', `${A}/equipment-registrations/${noWarranty.id}/model-policies`, manager,
    { expectedVersion: noWarranty.version }, 400);
  assert.equal(rejected.code, 'MAINTENANCE_WARRANTY_REQUIRED');
  const overlong = await publish(mp, { ...profile, rules: [{ ...rules[0], firstOccurrence: 100 }] });
  const invalid = await call('POST', `${mp}/${overlong.id}/preview`, manager, { handoverDate: '2026-01-31' }, 400);
  assert.equal(invalid.code, 'MAINTENANCE_FIRST_DUE_AFTER_END');
  evidence.push({ case: 'maintenance YEARS / UNLIMITED / WARRANTY_END; applied warranty override frozen across revision; replay and customer scope; expiry blocks new Tasks while real broker preserves existing WO; missing warranty rejected', status: 'PASS' });
};
