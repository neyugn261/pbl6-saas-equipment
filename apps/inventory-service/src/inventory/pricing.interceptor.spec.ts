import { redactCostPrice } from './pricing.interceptor';
describe('Cost-price visibility', () => {
  it('redacts nested includes and audit snapshots without mutating the source', () => {
    const value = {
      items: [
        {
          part: { costPrice: '12.30', standardPrice: '25.00' },
          before: { cost_price: '10.00' },
          after: { costPrice: null },
        },
      ],
    };
    expect(redactCostPrice(value)).toEqual({
      items: [{ part: { standardPrice: '25.00' }, before: {}, after: {} }],
    });
    expect(value.items[0].part.costPrice).toBe('12.30');
  });
});
