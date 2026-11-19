import { parseEquipmentCsv } from './bulk.dto';
describe('Equipment CSV parser', () => {
  it('accepts UTF-8 BOM, escaped quotes and multiline cells without executing formulas', () => {
    expect(
      parseEquipmentCsv(
        '\uFEFFassetCode,serialNumber,displayName\r\nA,S,"Pump, ""A""\nsecond line"',
        'model',
      ),
    ).toEqual([
      {
        modelId: 'model',
        assetCode: 'A',
        serialNumber: 'S',
        displayName: 'Pump, "A"\nsecond line',
      },
    ]);
  });
  it.each([
    'assetCode,serialNumber\nA',
    'assetCode,serialNumber\n"A,S',
    'assetCode,assetCode,serialNumber\nA,A,S',
    'assetCode,serialNumber,tenantId\nA,S,x',
  ])('rejects malformed input %s', (csv) => {
    expect(() => parseEquipmentCsv(csv, 'model')).toThrow();
  });
  it('rejects empty and oversized batches', () => {
    expect(() =>
      parseEquipmentCsv('assetCode,serialNumber\n', 'model'),
    ).toThrow();
    expect(() =>
      parseEquipmentCsv(
        'assetCode,serialNumber\n' + 'A,S\n'.repeat(51),
        'model',
      ),
    ).toThrow();
  });
});
