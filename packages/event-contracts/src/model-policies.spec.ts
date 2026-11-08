import {Events, payloadProblems} from './catalog';
import {
  addPolicyMonths,
  warrantyEnd,
  validWarrantyPolicy,
  validMaintenanceProfile,
  validChecklist,
  validMaintenanceTerm,
  maintenanceEndDate,
} from './model-policies';
const id = '11111111-1111-4111-8111-111111111111';
const item = {
  id,
  title: 'Inspect filter',
  action: 'INSPECT',
  instructions: 'Replace if damaged',
  required: true,
  allowNotApplicable: false,
};
describe('model policy contracts', () => {
  it('clamps each month from source and defines inclusive warranty end', () => {
    expect(addPolicyMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addPolicyMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addPolicyMonths('2024-02-29', 48)).toBe('2028-02-29');
    expect(warrantyEnd('2026-11-10', 12)).toBe('2027-11-09');
    expect(() => addPolicyMonths('2026-02-30', 1)).toThrow();
  });
  it('rejects contradictory causes, malformed values and implicit NONE', () => {
    const body = {
      mode: 'APPLY',
      name: 'Standard',
      terms: 'Terms',
      reason: '',
      durationMonths: 12,
      coveredCauses: ['MANUFACTURING_DEFECT'],
      exclusions: [{ code: 'LIQUID_INGRESS', text: 'Liquid ingress excluded' }],
    };
    expect(validWarrantyPolicy(body)).toBe(true);
    expect(
      validWarrantyPolicy({
        ...body,
        exclusions: [{ code: 'MANUFACTURING_DEFECT', text: 'Excluded' }],
      }),
    ).toBe(false);
    expect(validWarrantyPolicy({ ...body, coveredCauses: [3] })).toBe(false);
    expect(validWarrantyPolicy({ ...body, mode: 'NONE' })).toBe(false);
  });
  it('requires bounded unique rules and items and rejects extra fields', () => {
    const body = {
      mode: 'APPLY',
      name: 'Routine',
      terms: 'Agreed programme',
      reason: '',
      rules: [
        {
          id,
          name: 'Quarterly',
          frequencyUnit: 'MONTH',
          frequencyValue: 3,
          firstOccurrence: 1,
          checklist: [item],
        },
      ],
    };
    expect(validMaintenanceProfile(body)).toBe(true);
    expect(
      validMaintenanceProfile({
        ...body,
        rules: [...body.rules, ...body.rules],
      }),
    ).toBe(false);
    expect(validChecklist([item, item])).toBe(false);
    expect(validChecklist([{ ...item, autoIssueStock: true }])).toBe(false);
    expect(validMaintenanceProfile({ ...body, rules: [] })).toBe(false);
    for (const term of [{ mode: 'UNLIMITED' }, { mode: 'YEARS', years: 2 }, { mode: 'WARRANTY_END' }])
      expect(validMaintenanceProfile({ ...body, rules: [{ ...body.rules[0], term }] })).toBe(true);
    for (const term of [null, {}, { mode: 'YEARS', years: 0 }, { mode: 'YEARS', years: 1.5 },
      { mode: 'YEARS', years: 101 }, { mode: 'UNLIMITED', years: 2 }, { mode: 'WARRANTY_END', endDate: '2099-01-01' }]) {
      expect(validMaintenanceTerm(term)).toBe(false);
      expect(validMaintenanceProfile({ ...body, rules: [{ ...body.rules[0], term }] })).toBe(false);
    }
  });
  it('freezes inclusive finite terms with anniversary clamping and requires a warranty for WARRANTY_END', () => {
    expect(maintenanceEndDate('2026-01-31')).toBeNull();
    expect(maintenanceEndDate('2026-01-31', { mode: 'UNLIMITED' })).toBeNull();
    expect(maintenanceEndDate('2026-01-31', { mode: 'YEARS', years: 2 })).toBe('2028-01-31');
    expect(maintenanceEndDate('2024-02-29', { mode: 'YEARS', years: 1 })).toBe('2025-02-28');
    expect(maintenanceEndDate('2024-02-29', { mode: 'YEARS', years: 4 })).toBe('2028-02-29');
    expect(maintenanceEndDate('2026-01-31', { mode: 'WARRANTY_END' }, '2027-07-30')).toBe('2027-07-30');
    expect(() => maintenanceEndDate('2026-01-31', { mode: 'WARRANTY_END' })).toThrow('applied warranty');
    expect(() => maintenanceEndDate('2026-01-31', { mode: 'WARRANTY_END' }, '2026-02-30')).toThrow();
  });
});

describe('policy maintenance event validation', () => {
  it('requires nonempty immutable instructions on v2 but accepts the original v1 payload', () => {
    const wire={maintenanceTaskId:id,maintenancePlanId:id,equipmentId:id,customerId:id,customerSiteId:null,scheduledDate:'2026-04-30',title:'Quarterly inspection'};
    expect(payloadProblems(Events.MaintenanceTaskDue,wire)).toEqual([]);
    expect(payloadProblems(Events.MaintenanceTaskDueV2,{...wire,policyVersionId:id,checklist:[]})).not.toEqual([]);
    expect(payloadProblems(Events.MaintenanceTaskDueV2,{...wire,policyVersionId:id,checklist:[item]})).toEqual([]);
  });
});
