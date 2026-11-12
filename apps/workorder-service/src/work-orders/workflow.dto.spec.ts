import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ServiceReportDto } from './workflow.dto';

describe('ServiceReportDto validation', () => {
  const baseValid = {
    problemDescription: 'Motor failure',
    rootCause: 'Bearing worn out',
    solution: 'Replaced bearing and lubricated',
    result: 'RESOLVED',
    customerSummary: 'Motor bearing replaced successfully',
  };

  it('validates a correct RESOLVED service report without unresolvedReason', async () => {
    const dto = plainToInstance(ServiceReportDto, baseValid);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('validates a correct PARTIALLY_RESOLVED service report', async () => {
    const dto = plainToInstance(ServiceReportDto, {
      ...baseValid,
      result: 'PARTIALLY_RESOLVED',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects an UNRESOLVED report when unresolvedReason is missing', async () => {
    const dto = plainToInstance(ServiceReportDto, {
      ...baseValid,
      result: 'UNRESOLVED',
      solution: 'Could not resolve due to lack of spare parts',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const unresolvedError = errors.find((e) => e.property === 'unresolvedReason');
    expect(unresolvedError).toBeDefined();
  });

  it('rejects an UNRESOLVED report when unresolvedReason is empty', async () => {
    const dto = plainToInstance(ServiceReportDto, {
      ...baseValid,
      result: 'UNRESOLVED',
      solution: 'Could not resolve',
      unresolvedReason: '',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const unresolvedError = errors.find((e) => e.property === 'unresolvedReason');
    expect(unresolvedError).toBeDefined();
  });

  it('rejects an UNRESOLVED report when unresolvedReason exceeds 2000 characters', async () => {
    const dto = plainToInstance(ServiceReportDto, {
      ...baseValid,
      result: 'UNRESOLVED',
      solution: 'Could not resolve',
      unresolvedReason: 'x'.repeat(2001),
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const unresolvedError = errors.find((e) => e.property === 'unresolvedReason');
    expect(unresolvedError).toBeDefined();
  });

  it('accepts an UNRESOLVED report when a valid unresolvedReason is provided', async () => {
    const dto = plainToInstance(ServiceReportDto, {
      ...baseValid,
      result: 'UNRESOLVED',
      solution: 'Diagnosis completed, equipment requires factory replacement part',
      unresolvedReason: 'Motherboard completely burnt; component obsolete, requires escalation',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
