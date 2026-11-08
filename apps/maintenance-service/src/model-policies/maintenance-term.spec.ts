import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { ModelPoliciesService } from './model-policies.service';
import type { PrismaService } from '../prisma/prisma.service';

const id = '11111111-1111-4111-8111-111111111111';
const rule = {
  id,
  name: 'Inspection',
  frequencyUnit: 'MONTH',
  frequencyValue: 3,
  firstOccurrence: 1,
  checklist: [
    {
      id,
      title: 'Filter',
      action: 'INSPECT',
      instructions: '',
      required: true,
      allowNotApplicable: false,
    },
  ],
};
describe('maintenance term calendar preview', () => {
  const service = new ModelPoliciesService(
    {} as PrismaService,
    new ConfigService({ ASSET_SERVICE_URL: 'http://asset.test' }),
  );
  const get = jest.spyOn(service, 'get');
  function source(term?: object) {
    get.mockResolvedValue({
      body: {
        mode: 'APPLY',
        name: 'Routine',
        terms: '',
        reason: '',
        rules: [{ ...rule, ...(term ? { term } : {}) }],
      },
    } as never);
  }
  it('returns stable legacy previews and resolves a fixed term from handover', async () => {
    source();
    expect(
      (await service.preview({} as never, id, id, '2026-01-31')).dates,
    ).toEqual([{ itemId: id, date: '2026-04-30' }]);
    source({ mode: 'YEARS', years: 2 });
    expect(
      (await service.preview({} as never, id, id, '2026-01-31')).dates,
    ).toEqual([{ itemId: id, date: '2026-04-30', endDate: '2028-01-31' }]);
  });
  it('uses the applied warranty end, including a separate handover override', async () => {
    source({ mode: 'WARRANTY_END' });
    expect(
      (
        await service.preview(
          {} as never,
          id,
          id,
          '2026-01-31',
          [],
          '2027-07-30',
        )
      ).dates[0].endDate,
    ).toBe('2027-07-30');
    await expect(
      service.preview({} as never, id, id, '2026-01-31'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects first occurrences outside coverage instead of producing a useless Plan', async () => {
    source({ mode: 'WARRANTY_END' });
    await expect(
      service.preview({} as never, id, id, '2026-01-31', [], '2026-03-01'),
    ).rejects.toMatchObject({
      response: { code: 'MAINTENANCE_FIRST_DUE_AFTER_END' },
    });
  });
});
