import { decimal, fingerprint, json, lowStockPolicy } from './policy';

describe('Inventory exact decimals and low-stock policy', () => {
  it('adds decimal fractions without rounding error and emits fixed strings', () => {
    expect(json({ quantity: decimal('0.10').plus(decimal('0.20')) })).toEqual({
      quantity: '0.30',
    });
    expect(decimal('9999999999.99').toFixed(2)).toBe('9999999999.99');
    expect(decimal('999999999999.99', false, true).toFixed(2)).toBe(
      '999999999999.99',
    );
  });
  it.each(['1e3', '-1', '01', '0.001', '10000000000', '', ' 1 ', '.1', 'NaN'])(
    'rejects invalid quantity %s',
    (value) => {
      expect(() => decimal(value)).toThrow();
    },
  );
  it('rejects numeric JSON and zero movement', () => {
    expect(() => decimal(1 as unknown as string)).toThrow();
    for (const zero of ['0', '0.0', '0.00'])
      expect(() => decimal(zero, true)).toThrow();
  });
  it('uses strict less-than and re-arms at equality', () => {
    expect(lowStockPolicy(decimal('4.99'), decimal('5'), false)).toEqual({
      low: true,
      emit: true,
      clear: false,
    });
    expect(lowStockPolicy(decimal('4.98'), decimal('5'), true)).toEqual({
      low: true,
      emit: false,
      clear: false,
    });
    expect(lowStockPolicy(decimal('5'), decimal('5'), true)).toEqual({
      low: false,
      emit: false,
      clear: true,
    });
    expect(lowStockPolicy(decimal('0'), decimal('0'), false).emit).toBe(false);
  });
  it('deduplicates canonical object order while separating operation and payload', () => {
    expect(fingerprint('RECEIVE', { a: 1, b: 2 })).toBe(
      fingerprint('RECEIVE', { b: 2, a: 1 }),
    );
    expect(fingerprint('RECEIVE', { a: 1 })).not.toBe(
      fingerprint('ISSUE', { a: 1 }),
    );
    expect(fingerprint('RECEIVE', { a: 1 })).not.toBe(
      fingerprint('RECEIVE', { a: 2 }),
    );
  });
});
