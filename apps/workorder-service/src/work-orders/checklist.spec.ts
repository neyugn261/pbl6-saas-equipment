import { validateResults } from './checklist';
const items = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Inspect',
    action: 'INSPECT' as const,
    instructions: '',
    required: true,
    allowNotApplicable: false,
  },
];
describe('work order required checklist', () => {
  it('blocks an omitted or not-done required result at completion', () => {
    expect(() => validateResults(items, [], true)).toThrow(
      'Complete all required',
    );
    expect(() =>
      validateResults(
        items,
        [{ itemId: items[0].id, status: 'NOT_DONE', note: '' }],
        true,
      ),
    ).toThrow();
  });
  it('rejects forged IDs, duplicate results and forbidden N/A', () => {
    const result = {
      itemId: items[0].id,
      status: 'DONE' as const,
      note: 'Checked',
    };
    expect(() => validateResults(items, [result, result])).toThrow();
    expect(() =>
      validateResults(items, [{ ...result, itemId: 'other' }]),
    ).toThrow();
    expect(() =>
      validateResults(items, [
        { ...result, status: 'NOT_APPLICABLE', note: 'Reason' },
      ]),
    ).toThrow();
  });
  it('accepts DONE or explicitly allowed N/A with reason', () => {
    expect(() =>
      validateResults(
        items,
        [{ itemId: items[0].id, status: 'DONE', note: '' }],
        true,
      ),
    ).not.toThrow();
    expect(() =>
      validateResults(
        [{ ...items[0], allowNotApplicable: true }],
        [
          {
            itemId: items[0].id,
            status: 'NOT_APPLICABLE',
            note: 'Optional module not installed',
          },
        ],
        true,
      ),
    ).not.toThrow();
  });
});
