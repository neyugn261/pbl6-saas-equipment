import { coveredIncident, estimateAllowed } from './warranty-coverage';
describe('temporal warranty versus incident coverage', () => {
  it('keeps legacy time-only flow compatible', () =>
    expect(coveredIncident({ warrantyCheckResult: 'IN_WARRANTY' })).toBe(true));
  it('does not auto-accept or charge an unassessed policy-backed incident', () => {
    const row = {
      warrantyCheckResult: 'IN_WARRANTY',
      assessmentRequired: true,
    };
    expect(coveredIncident(row)).toBe(false);
    expect(estimateAllowed(row)).toBe(false);
  });
  it('allows estimates for still-in-term excluded incidents without voiding warranty', () => {
    const row = {
      warrantyCheckResult: 'IN_WARRANTY',
      assessmentRequired: true,
      coverageAssessment: { decision: 'NOT_COVERED' },
    };
    expect(coveredIncident(row)).toBe(false);
    expect(estimateAllowed(row)).toBe(true);
  });
  it('requires temporal validity even if an old assessment said covered', () => {
    expect(
      coveredIncident({
        warrantyCheckResult: 'OUT_OF_WARRANTY',
        assessmentRequired: true,
        coverageAssessment: { decision: 'COVERED' },
      }),
    ).toBe(false);
  });
});
